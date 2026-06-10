import { useEffect } from 'react';

// ── Module-level shared state ─────────────────────────────────────────────────
const BASE_TITLE = 'CRM Pós-Venda';
let badgeCount = 0;
let permissionRequested = false;

function updateTitle() {
  document.title = badgeCount > 0 ? `(${badgeCount}) ${BASE_TITLE}` : BASE_TITLE;
}

function incrementBadge() {
  badgeCount++;
  updateTitle();
}

function resetBadge() {
  badgeCount = 0;
  updateTitle();
}

async function requestPermissionOnce() {
  if (permissionRequested) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    permissionRequested = true;
    await Notification.requestPermission();
  } else {
    permissionRequested = true;
  }
}

function showOsNotification(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

function playNotificationSound(type: 'whatsapp' | 'chat' | 'announcement') {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    if (type === 'whatsapp') {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'chat') {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      // Dois bips para announcement
      const osc1 = ctx.createOscillator();
      osc1.connect(gain);
      osc1.frequency.value = 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.15);

      const osc2 = ctx.createOscillator();
      osc2.connect(gain);
      osc2.frequency.value = 1200;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.2);
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.4);
    }
  } catch {
    // AudioContext may be blocked; ignore silently
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useNotifications() {
  // Reset badge when user returns to tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetBadge();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const notifyWhatsApp = (contactName: string, messagePreview: string) => {
    requestPermissionOnce();
    playNotificationSound('whatsapp');
    if (document.visibilityState !== 'visible') {
      incrementBadge();
      showOsNotification(`WhatsApp: ${contactName}`, messagePreview);
    }
  };

  const notifyChat = (senderName: string, messagePreview: string) => {
    requestPermissionOnce();
    playNotificationSound('chat');
    if (document.visibilityState !== 'visible') {
      incrementBadge();
      showOsNotification(`Chat: ${senderName}`, messagePreview);
    }
  };

  const notifyAnnouncement = (title: string, body: string) => {
    requestPermissionOnce();
    playNotificationSound('announcement');
    if (document.visibilityState !== 'visible') {
      incrementBadge();
      showOsNotification(title, body);
    }
  };

  return { notifyWhatsApp, notifyChat, notifyAnnouncement };
}
