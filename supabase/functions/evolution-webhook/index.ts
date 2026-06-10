import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}

interface MessageData {
  key: MessageKey;
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string; fileName?: string };
    audioMessage?: unknown;
    stickerMessage?: unknown;
  };
  messageType?: string;
  messageTimestamp?: number | string;
}

function extractMessageText(message: MessageData["message"]): string {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.documentMessage?.fileName) return `[Documento: ${message.documentMessage.fileName}]`;
  if (message.audioMessage) return "[Audio]";
  if (message.stickerMessage) return "[Sticker]";
  if (message.imageMessage) return "[Imagem]";
  if (message.videoMessage) return "[Video]";
  return "";
}

function normalizePhone(jidOrPhone: string): string {
  const phone = jidOrPhone.includes("@")
    ? jidOrPhone.split("@")[0]
    : jidOrPhone;
  return phone.replace(/\D/g, "");
}

function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, "");
  const variants: string[] = [cleaned];

  if (cleaned.startsWith("55") && cleaned.length >= 12) {
    const withoutCountry = cleaned.slice(2);
    variants.push(withoutCountry);

    const ddd = cleaned.slice(2, 4);
    const rest = cleaned.slice(4);

    if (rest.length === 9 && rest.startsWith("9")) {
      const without9 = ddd + rest.slice(1);
      variants.push("55" + without9);
      variants.push(without9);
    } else if (rest.length === 8) {
      const with9 = ddd + "9" + rest;
      variants.push("55" + with9);
      variants.push(with9);
    }
  }

  return variants;
}

function getMessageType(message: MessageData["message"]): string {
  if (!message) return "unknown";
  if (message.conversation || message.extendedTextMessage) return "text";
  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  return "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const payload: WebhookPayload = await req.json();
    const { event, instance: instanceName, data } = payload;

    if (!instanceName) {
      return new Response(JSON.stringify({ error: "Missing instance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: instanceData } = await supabase
      .from("whatsapp_instances")
      .select("id, user_id")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!instanceData) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = instanceData.user_id;

    await supabase
      .from("whatsapp_instances")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", instanceData.id);

    console.log(`[Webhook] Event: ${event} | Instance: ${instanceName}`);

    // ── messages.upsert ──────────────────────────────────────────────────────
    if (event === "messages.upsert") {
      const messages = Array.isArray(data) ? data : [data];

      for (const msgData of messages as MessageData[]) {
        const { key, pushName, message, messageTimestamp } = msgData;

        if (!key?.remoteJid || !key?.id) continue;
        if (key.remoteJid === "status@broadcast") continue;
        if (key.remoteJid.endsWith("@g.us")) continue;

        const isSentByUs = key.fromMe === true;

        const isGroup = key.remoteJid.includes("@g.us");
        const contactPhone = isGroup ? key.remoteJid : normalizePhone(key.remoteJid);
        if (!contactPhone) continue;

        const messageText = extractMessageText(message);
        const messageType = getMessageType(message);
        const timestamp = messageTimestamp
          ? new Date(
              typeof messageTimestamp === "string"
                ? parseInt(messageTimestamp) * 1000
                : messageTimestamp * 1000
            )
          : new Date();

        // Busca chat existente
        const { data: existingChat } = await supabase
          .from("persistent_chats")
          .select("id, contact_name, is_group, unread_count")
          .eq("user_id", userId)
          .eq("contact_phone", contactPhone)
          .maybeSingle();

        const phoneVariants = isGroup ? [] : getPhoneVariants(contactPhone);
        const { data: linkedCliente } = isGroup
          ? { data: null }
          : await supabase
              .from("clientes")
              .select("id")
              .in("telefone_normalized", phoneVariants)
              .maybeSingle();

        const clienteId = linkedCliente?.id || null;
        let chatId: string;

        if (existingChat) {
          chatId = existingChat.id;

          const updateData: Record<string, unknown> = {
            contact_jid: key.remoteJid,
            last_message_text: messageText,
            last_message_timestamp: timestamp.toISOString(),
            last_message_from_me: isSentByUs,
            updated_at: new Date().toISOString(),
          };

          if (clienteId) updateData.cliente_id = clienteId;

          if (pushName && !isSentByUs && !isGroup) {
            updateData.push_name = pushName;
            if (!existingChat.contact_name || existingChat.contact_name === contactPhone) {
              updateData.contact_name = pushName;
            }
          }

          if (!isSentByUs) {
            updateData.unread_count = (existingChat.unread_count || 0) + 1;
          }

          await supabase
            .from("persistent_chats")
            .update(updateData)
            .eq("id", chatId);

        } else {
          const contactName = isGroup
            ? key.remoteJid.split("@")[0]
            : pushName || contactPhone;

          const { data: newChat, error: chatError } = await supabase
            .from("persistent_chats")
            .insert({
              user_id: userId,
              instance_name: instanceName,
              contact_phone: contactPhone,
              contact_name: contactName,
              contact_jid: key.remoteJid,
              is_group: isGroup,
              last_message_text: messageText,
              last_message_timestamp: timestamp.toISOString(),
              last_message_from_me: isSentByUs,
              unread_count: isSentByUs ? 0 : 1,
              cliente_id: clienteId,
              push_name: pushName || null,
            })
            .select("id")
            .single();

          if (chatError) {
            console.error("[Webhook] Error creating chat:", chatError);
            continue;
          }

          chatId = newChat.id;
        }

        // Insere mensagem (deduplicado por message_id)
        const { data: existingMessage } = await supabase
          .from("persistent_messages")
          .select("id")
          .eq("chat_id", chatId)
          .eq("message_id", key.id)
          .maybeSingle();

        if (!existingMessage) {
          const messageInsert: Record<string, unknown> = {
            user_id: userId,
            chat_id: chatId,
            message_id: key.id,
            from_me: isSentByUs,
            message_text: messageText,
            message_type: messageType,
            timestamp: timestamp.toISOString(),
            instance_name: instanceName,
          };

          if (isGroup && key.participant) {
            messageInsert.participant_jid = key.participant;
            messageInsert.participant_name = pushName || null;
          }

          await supabase.from("persistent_messages").insert(messageInsert);
        }
      }
    }

    // ── connection.update ────────────────────────────────────────────────────
    if (event === "connection.update") {
      const connectionData = data as { state?: string };
      const isConnected = connectionData?.state === "open";

      await supabase
        .from("whatsapp_instances")
        .update({
          is_connected: isConnected,
          disconnected_at: isConnected ? null : new Date().toISOString(),
          alert_sent: isConnected ? false : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", instanceData.id);

      console.log(`[Webhook] Instance ${instanceName} → ${isConnected ? "CONNECTED" : "DISCONNECTED"}`);

      // Sync de grupos REMOVIDO — causava requisições em massa ao WhatsApp
      // Nomes de grupos são atualizados quando mensagens chegam via webhook
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});