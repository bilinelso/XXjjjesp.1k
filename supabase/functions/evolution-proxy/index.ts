import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEvolutionConfig() {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!url || !key) throw new Error("EVOLUTION_API_URL or EVOLUTION_API_KEY not set");
  return { url: url.replace(/\/$/, ""), key };
}

async function evolutionFetch(
  path: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { url, key } = getEvolutionConfig();
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", apikey: key },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${url}${path}`, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data };
}

async function deleteEvolutionInstance(instanceName: string) {
  try { await evolutionFetch(`/instance/logout/${instanceName}`, "DELETE"); } catch { /* ok */ }
  try { await evolutionFetch(`/instance/delete/${instanceName}`, "DELETE"); } catch { /* ok */ }
}

async function createEvolutionInstance(instanceName: string) {
  return await evolutionFetch("/instance/create", "POST", {
    instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  });
}

async function configureWebhook(instanceName: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
  return await evolutionFetch(`/webhook/set/${instanceName}`, "POST", {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: true,
      webhook_base64: false,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    },
  });
}

Deno.serve(
  { onListen: () => {}, onError: () => new Response("Internal Server Error", { status: 500 }) },
  async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Missing authorization" }, 401);

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) return json({ error: "Unauthorized" }, 401);

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_master, can_access_whatsapp")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || (!profile.is_master && !profile.can_access_whatsapp)) {
        return json({ error: "Access denied" }, 403);
      }

      const body = await req.json();
      const { endpoint, method = "GET", body: requestBody } = body;

      if (endpoint === "/user-instance" && method === "GET") {
        const { data } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        return json(data);
      }

      if (endpoint === "/user-instance" && method === "POST") {
        const instanceName = `crm-${user.id.substring(0, 8)}`;

        const { data: existing } = await supabase
          .from("whatsapp_instances")
          .select("id, instance_name, is_connected")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          return json({ instance_name: existing.instance_name, already_exists: true });
        }

        const createResult = await createEvolutionInstance(instanceName);
        if (!createResult.ok) {
          console.error("Failed to create Evolution instance:", createResult.data);
          if (createResult.status !== 409) {
            return json({ error: "Failed to create WhatsApp instance", detail: createResult.data }, 500);
          }
        }

        await configureWebhook(instanceName);

        const { error: insertError } = await supabase
          .from("whatsapp_instances")
          .insert({
            user_id: user.id,
            instance_name: instanceName,
            is_connected: false,
            is_active: true,
          });

        if (insertError) throw insertError;

        return json({ instance_name: instanceName, created: true });
      }

      if (endpoint === "/user-instance" && method === "DELETE") {
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (instance?.instance_name) {
          await deleteEvolutionInstance(instance.instance_name);
        }

        await supabase
          .from("whatsapp_instances")
          .delete()
          .eq("user_id", user.id);

        return json({ success: true });
      }

      if (endpoint === "/user-instance/reconnect" && method === "POST") {
        const instanceName = `crm-${user.id.substring(0, 8)}`;

        const { data: existing } = await supabase
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing?.instance_name) {
          await deleteEvolutionInstance(existing.instance_name);
        }

        await supabase
          .from("whatsapp_instances")
          .upsert({
            user_id: user.id,
            instance_name: instanceName,
            is_connected: false,
            phone_number: null,
            status: "disconnected",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });

        const createResult = await createEvolutionInstance(instanceName);

        await configureWebhook(instanceName);

        return json({ instance_name: instanceName, recreated: true, detail: createResult.data });
      }

      if (endpoint === "/user-instance/status" && method === "POST") {
        const { is_connected, phone_number } = requestBody || {};
        const { error } = await supabase
          .from("whatsapp_instances")
          .update({
            is_connected: !!is_connected,
            phone_number: phone_number || null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (error) throw error;
        return json({ success: true });
      }

      const result = await evolutionFetch(endpoint, method, requestBody);

      if (result.status === 404 && endpoint.includes("/instance/connectionState/")) {
        const instName = endpoint.split("/instance/connectionState/")[1];
        return json({ instance: instName, state: { state: "close" } });
      }

      if (result.status === 404 && endpoint.includes("/instance/connect/")) {
        const instName = endpoint.split("/instance/connect/")[1];

        const recreate = await createEvolutionInstance(instName);
        if (!recreate.ok && recreate.status !== 409) {
          return json({ error: "Could not create instance", detail: recreate.data }, 500);
        }

        await configureWebhook(instName);
        await new Promise((r) => setTimeout(r, 800));

        const retry = await evolutionFetch(`/instance/connect/${instName}`, "GET");
        return json(retry.data, retry.status);
      }

      return json(result.data, result.status);

    } catch (error) {
      console.error("Evolution proxy error:", error);
      return json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        500
      );
    }
  }
);
