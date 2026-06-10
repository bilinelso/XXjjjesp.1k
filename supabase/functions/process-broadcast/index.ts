import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Each chunk processes up to 5 recipients (~100s at 20s delay), well within timeout
const CHUNK_SIZE = 5;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendWhatsAppMessage(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  phone: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({ number: phone, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function personalizeMessage(template: string, nome: string, assessor: string): string {
  return template
    .replace(/\{primeiro_nome\}/gi, nome.split(" ")[0])
    .replace(/\{nome\}/gi, nome)
    .replace(/\{assessor\}/gi, assessor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, "");
  const variants: string[] = [cleaned];

  if (cleaned.startsWith("55") && cleaned.length >= 12) {
    variants.push(cleaned.slice(2));
    const ddd = cleaned.slice(2, 4);
    const rest = cleaned.slice(4);

    if (rest.length === 9 && rest.startsWith("9")) {
      variants.push("55" + ddd + rest.slice(1));
      variants.push(ddd + rest.slice(1));
    } else if (rest.length === 8) {
      variants.push("55" + ddd + "9" + rest);
      variants.push(ddd + "9" + rest);
    }
  }
  return [...new Set(variants)];
}

async function getOrCreateChat(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  instanceName: string,
  phone: string,
  name: string
): Promise<string> {
  const jid = `${phone}@s.whatsapp.net`;
  const variants = getPhoneVariants(phone);
  const jidVariants = variants.map((v) => `${v}@s.whatsapp.net`);

  const { data: existingByPhone } = await supabase
    .from("persistent_chats")
    .select("id")
    .eq("user_id", userId)
    .in("contact_phone", variants)
    .maybeSingle();

  if (existingByPhone) return existingByPhone.id;

  const { data: existingByJid } = await supabase
    .from("persistent_chats")
    .select("id")
    .eq("user_id", userId)
    .in("contact_jid", jidVariants)
    .maybeSingle();

  if (existingByJid) return existingByJid.id;

  const { data, error } = await supabase
    .from("persistent_chats")
    .upsert({
      user_id: userId,
      instance_name: instanceName,
      contact_phone: phone,
      contact_name: name,
      contact_jid: jid,
      is_group: false,
      last_message_from_me: true,
    }, {
      onConflict: "user_id,contact_phone",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (error) {
    const { data: existing } = await supabase
      .from("persistent_chats")
      .select("id")
      .eq("user_id", userId)
      .in("contact_phone", variants)
      .maybeSingle();

    if (existing) return existing.id;
    throw new Error(`Failed to get/create chat: ${error.message}`);
  }

  return data.id;
}

async function recordSentMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  instanceName: string,
  phone: string,
  name: string,
  personalizedText: string,
  sentAt: string
): Promise<void> {
  const chatId = await getOrCreateChat(supabase, userId, instanceName, phone, name);
  const messageId = crypto.randomUUID();
  const timestampIso = new Date(sentAt).toISOString();

  const { error: msgError } = await supabase
    .from("persistent_messages")
    .insert({
      user_id: userId,
      chat_id: chatId,
      instance_name: instanceName,
      message_id: messageId,
      from_me: true,
      message_text: personalizedText,
      message_type: "text",
      timestamp: timestampIso,
      participant_jid: null,
      media_url: null,
      media_base64: null,
    });

  if (msgError && !msgError.message.includes("duplicate")) {
    console.error("[Broadcast] Error inserting message:", msgError.message);
  }

  await supabase
    .from("persistent_chats")
    .update({
      last_message_text: personalizedText,
      last_message_timestamp: timestampIso,
      last_message_from_me: true,
    })
    .eq("id", chatId);
}

async function invokeNextChunk(broadcastId: string): Promise<void> {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ broadcast_id: broadcastId }),
    });
  } catch (err) {
    console.error("[Broadcast] invokeNextChunk failed:", err);
  }
}

async function processChunk(
  supabase: ReturnType<typeof createClient>,
  evolutionUrl: string,
  evolutionKey: string,
  broadcastId: string
): Promise<void> {
  const { data: broadcast } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .maybeSingle();

  if (!broadcast || broadcast.status === "completed" || broadcast.status === "failed") {
    return;
  }

  // Atomically mark as processing on first invocation
  if (broadcast.status === "pending") {
    await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "processing" })
      .eq("id", broadcastId)
      .eq("status", "pending");
  }

  // Fetch only CHUNK_SIZE pending recipients
  const { data: recipients } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("*, clientes(assessor)")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending")
    .order("id")
    .limit(CHUNK_SIZE);

  // No more pending recipients → mark as completed
  if (!recipients || recipients.length === 0) {
    const { data: current } = await supabase
      .from("whatsapp_broadcasts")
      .select("sent_count, failed_count")
      .eq("id", broadcastId)
      .single();

    await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "completed", sent_count: current?.sent_count ?? 0, failed_count: current?.failed_count ?? 0 })
      .eq("id", broadcastId);

    console.log(`[Broadcast] ${broadcastId} completed`);
    return;
  }

  const delayMs = (broadcast.delay_seconds ?? 20) * 1000;
  let sentCount = broadcast.sent_count ?? 0;
  let failedCount = broadcast.failed_count ?? 0;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    const personalized = personalizeMessage(
      broadcast.message,
      recipient.name || "",
      (recipient.clientes as { assessor?: string } | null)?.assessor || ""
    );

    await supabase
      .from("whatsapp_broadcast_recipients")
      .update({ message_personalized: personalized, status: "sending" })
      .eq("id", recipient.id);

    const result = await sendWhatsAppMessage(
      evolutionUrl,
      evolutionKey,
      broadcast.instance_name,
      recipient.phone,
      personalized
    );

    if (result.ok) {
      sentCount++;
      const sentAt = new Date().toISOString();

      await supabase
        .from("whatsapp_broadcast_recipients")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", recipient.id);

      if (broadcast.user_id) {
        try {
          await recordSentMessage(
            supabase,
            broadcast.user_id,
            broadcast.instance_name,
            recipient.phone,
            recipient.name || "",
            personalized,
            sentAt
          );
        } catch (chatErr) {
          console.error("[Broadcast] Error recording message in chat:", chatErr);
        }
      }
    } else {
      failedCount++;
      await supabase
        .from("whatsapp_broadcast_recipients")
        .update({ status: "failed", error: result.error })
        .eq("id", recipient.id);
    }

    await supabase
      .from("whatsapp_broadcasts")
      .update({ sent_count: sentCount, failed_count: failedCount })
      .eq("id", broadcastId);

    // Delay between messages within the chunk (except after the last one)
    if (i < recipients.length - 1) {
      await sleep(delayMs);
    }
  }

  // Check if more recipients remain
  const { count } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending");

  if (count && count > 0) {
    // Apply inter-chunk delay then self-invoke for the next chunk
    await sleep(delayMs);
    await invokeNextChunk(broadcastId);
  } else {
    await supabase
      .from("whatsapp_broadcasts")
      .update({ status: "completed", sent_count: sentCount, failed_count: failedCount })
      .eq("id", broadcastId);

    console.log(`[Broadcast] ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const evolutionUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";

  try {
    const body = await req.json().catch(() => ({}));
    let broadcastIds: string[] = [];

    if (body.broadcast_id) {
      broadcastIds = [body.broadcast_id];
    } else {
      // Process all scheduled broadcasts due now
      const { data: scheduled } = await supabase
        .from("whatsapp_broadcasts")
        .select("id")
        .eq("status", "pending")
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", new Date().toISOString());
      broadcastIds = (scheduled || []).map((b: { id: string }) => b.id);
    }

    if (broadcastIds.length === 0) {
      return json({ success: true, message: "No broadcasts to process" });
    }

    // Return immediately — processing continues in background via EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(
      (async () => {
        for (const id of broadcastIds) {
          await processChunk(supabase, evolutionUrl, evolutionKey, id);
        }
      })()
    );

    return json({ ok: true, status: "processing" });
  } catch (err) {
    console.error("[Broadcast] Error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
