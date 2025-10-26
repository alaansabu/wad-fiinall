// Messages page: show meeting conversations and enable minimal chat between participants.
const MEETINGS_API_BASE = 'http://localhost:5000/api/v1/meetings';
const MESSAGES_API_BASE = 'http://localhost:5000/api/v1/messages';

const state = {
  conversations: [], // grouped: { counterpartId, counterpartName, meetings: [meeting], role: 'incoming'|'outgoing'|'both' }
  activeCounterpartId: null,
  socket: null,
  meetingShowCount: 5,
  scheduledNotifs: new Set()
};

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function getMyId() {
  const me = getStoredUser();
  if (!me) return null;
  // Try common shapes
  return (
    me._id || me.id || me.userId ||
    (me.user && (me.user._id || me.user.id)) ||
    (me.profile && (me.profile.user || me.profile._id)) ||
    null
  );
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString();
  } catch (e) { return dateString; }
}

async function loadConversations() {
  const chatList = document.getElementById('chat-list');
  if (chatList) chatList.innerHTML = '';

  const headers = authHeaders();
  if (!headers.Authorization) {
    // Not logged in
    if (chatList) chatList.innerHTML = '<li>Please log in to view your messages</li>';
    return;
  }

  try {
    const [incomingRes, outgoingRes] = await Promise.all([
      fetch(`${MEETINGS_API_BASE}/requests`, { headers }),
      fetch(`${MEETINGS_API_BASE}/scheduled`, { headers })
    ]);

    const incomingJson = await incomingRes.json();
    const outgoingJson = await outgoingRes.json();

    // Group by counterpartId
    const map = new Map();

    const addMeeting = (role, m, counterpart) => {
      const id = (counterpart?._id || '').toString();
      const name = counterpart?.name || 'Unknown User';
      if (!id) return;
      if (!map.has(id)) map.set(id, { counterpartId: id, counterpartName: name, meetings: [], role });
      const entry = map.get(id);
      entry.meetings.push(m);
      if (entry.role !== role) entry.role = 'both';
    };

    if (incomingRes.ok && incomingJson.success && Array.isArray(incomingJson.data)) {
      for (const m of incomingJson.data) addMeeting('incoming', m, m.requester || {});
    }
    if (outgoingRes.ok && outgoingJson.success && Array.isArray(outgoingJson.data)) {
      for (const m of outgoingJson.data) addMeeting('outgoing', m, m.postOwner || {});
    }

    const conversations = Array.from(map.values()).map(c => ({
      ...c,
      meetings: c.meetings.sort((a, b) => new Date(b.createdAt || b.scheduledDate || 0) - new Date(a.createdAt || a.scheduledDate || 0))
    }));

    // Sort conv list by most recent meeting
    conversations.sort((a, b) => {
      const ad = new Date(a.meetings[0]?.createdAt || a.meetings[0]?.scheduledDate || 0);
      const bd = new Date(b.meetings[0]?.createdAt || b.meetings[0]?.scheduledDate || 0);
      return bd - ad;
    });

    state.conversations = conversations;

    renderConversationList();
    ensureSocket();
    scheduleMeetingNotifications();
  } catch (err) {
    console.error('Failed to load conversations', err);
    if (chatList) chatList.innerHTML = '<li>Error loading messages</li>';
  }
}

function canNotify() {
  return 'Notification' in window;
}

async function requestNotificationPermission() {
  try {
    if (!canNotify()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch { return false; }
}

function getMeetingDateTime(m) {
  try {
    if (!m || !m.scheduledDate) return null;
    const d = new Date(m.scheduledDate);
    const datePart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const timePart = (m.scheduledTime || '00:00').slice(0,5);
    const dt = new Date(`${datePart}T${timePart}`);
    return isNaN(dt.getTime()) ? null : dt;
  } catch { return null; }
}

async function scheduleMeetingNotifications() {
  const ok = await requestNotificationPermission();
  if (!ok) return;

  const now = Date.now();
  const soonMs = 24 * 60 * 60 * 1000; // schedule up to 24h ahead

  const allMeetings = state.conversations.flatMap(c => c.meetings.map(m => ({ m, c })));
  allMeetings.forEach(({ m, c }) => {
    if (m.status !== 'accepted') return;
    const when = getMeetingDateTime(m);
    if (!when) return;
    const diff = when.getTime() - now;
    if (diff < -60 * 1000) return; // already passed more than 1m ago
    if (diff > soonMs) return; // too far in future for this session
    const key = m._id;
    if (state.scheduledNotifs.has(key)) return;
    state.scheduledNotifs.add(key);
    setTimeout(() => {
      try {
        new Notification('Meeting starting now', {
          body: `${c.counterpartName} • ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          tag: `meeting-${key}`
        });
      } catch {}
    }, Math.max(0, diff));
  });
}

function renderConversationList() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;
  chatList.innerHTML = '';

  if (!state.conversations.length) {
    chatList.innerHTML = '<li>No messages yet</li>';
    return;
  }

  state.conversations.forEach(conv => {
    const li = document.createElement('li');
    li.textContent = conv.counterpartName;
    li.dataset.id = conv.counterpartId;
    if (state.activeCounterpartId === conv.counterpartId) li.classList.add('active');
    li.title = `${conv.role === 'incoming' ? 'From' : conv.role === 'outgoing' ? 'To' : 'Both'}: ${conv.counterpartName}`;
    li.addEventListener('click', (e) => {
      // Toggle active state in sidebar
      const parent = e.currentTarget?.parentElement;
      if (parent) {
        Array.from(parent.children).forEach(el => el.classList?.remove('active'));
      }
      e.currentTarget.classList.add('active');
      openConversation(conv.counterpartId);
    });
    chatList.appendChild(li);
  });
}

function openConversation(counterpartId) {
  const conv = state.conversations.find(c => c.counterpartId === counterpartId);
  state.activeCounterpartId = counterpartId;

  // reflect active state in list
  updateActiveListItem();

  const chatUser = document.getElementById('chat-user');
  const chatBox = document.getElementById('chat-box');
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const meetingActions = document.getElementById('meeting-actions');
  const acceptBtn = document.getElementById('acceptBtn');
  const rejectBtn = document.getElementById('rejectBtn');

  if (!conv || !chatBox || !chatUser) return;

  // Enable chat for active conversation
  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  chatUser.textContent = conv.counterpartName;
  chatBox.innerHTML = '';

  // Render recent meetings for this counterpart
  const toShow = conv.meetings.slice(0, state.meetingShowCount);
  toShow.forEach(m => {
    const scheduledDate = m.scheduledDate ? formatDate(m.scheduledDate) : '—';
    const scheduledTime = m.scheduledTime || '—';
    const originalMsg = m.message || '';
    const status = m.status || 'pending';
    const info = document.createElement('div');
    info.className = 'message received';
    info.innerHTML = `
      <div><strong>Meeting:</strong> ${scheduledDate} at ${scheduledTime}</div>
      <div><strong>Status:</strong> ${status}</div>
      ${originalMsg ? `<div><strong>Message:</strong> ${escapeHtml(originalMsg)}</div>` : ''}
    `;
    chatBox.appendChild(info);
  });

  if (conv.meetings.length > state.meetingShowCount) {
    const more = document.createElement('button');
    more.textContent = 'Show more';
    more.className = 'load-more';
    more.addEventListener('click', () => {
      state.meetingShowCount += 5;
      openConversation(counterpartId);
    });
    chatBox.appendChild(more);
  }

  chatBox.scrollTop = chatBox.scrollHeight;

  // Accept/Reject only for the latest PENDING meeting where current user is the post owner
  const myId = getMyId();
  const latestIncomingPending = conv.meetings.find(m => {
    if (!m || m.status !== 'pending') return false;
    const ownerId = (m.postOwner && (m.postOwner._id || m.postOwner)) || null;
    return myId && ownerId && String(ownerId) === String(myId);
  });

  const showActions = !!latestIncomingPending;
  if (meetingActions) meetingActions.style.display = showActions ? 'flex' : 'none';
  if (showActions) {
    const targetId = latestIncomingPending._id;
    acceptBtn.onclick = () => handleAccept(targetId);
    rejectBtn.onclick = () => handleReject(targetId);
  } else {
    if (acceptBtn) acceptBtn.onclick = null;
    if (rejectBtn) rejectBtn.onclick = null;
  }

  // Load and render chat history under the meetings
  loadChatHistory(counterpartId).catch(() => {});
}

function updateActiveListItem() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;
  Array.from(chatList.children).forEach(li => {
    if (!(li instanceof HTMLElement)) return;
    const id = li.dataset?.id;
    if (id === state.activeCounterpartId) li.classList.add('active');
    else li.classList.remove('active');
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = (input?.value || '').trim();
  if (!text || !state.activeCounterpartId) return;
  try {
    const res = await fetch(`${MESSAGES_API_BASE}/${state.activeCounterpartId}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to send');
    appendChatMessage(json.data, true);
    input.value = '';
  } catch (e) {
    alert(e.message || 'Failed to send message');
  }
}

function appendChatMessage(msg, isMine) {
  const chatBox = document.getElementById('chat-box');
  if (!chatBox) return;
  const div = document.createElement('div');
  div.className = `message ${isMine ? 'sent' : 'received'} enter`;
  div.textContent = msg.content;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  // remove enter class after animation
  setTimeout(() => div.classList.remove('enter'), 250);
}

async function loadChatHistory(counterpartId) {
  const headers = authHeaders();
  if (!headers.Authorization) return;
  const res = await fetch(`${MESSAGES_API_BASE}/with/${counterpartId}?limit=50`, { headers });
  const json = await res.json();
  if (!res.ok || !json.success || !Array.isArray(json.data)) return;
  const me = getStoredUser();
  const myId = me?._id || me?.id || me?.userId || null;
  for (const m of json.data) {
    const isMine = myId && (m.sender?._id === myId || m.sender === myId);
    appendChatMessage(m, !!isMine);
  }
}

function ensureSocket() {
  if (state.socket) return;
  const token = getToken();
  if (!token || typeof io === 'undefined') return;
  state.socket = io({ withCredentials: true });
  state.socket.on('connect', () => {
    state.socket.emit('auth', token);
  });
  state.socket.on('message:new', (msg) => {
    // Only append if this chat is active and message is from/to counterpart
    const otherId = msg.sender?._id === state.activeCounterpartId || msg.recipient?._id === state.activeCounterpartId;
    if (otherId) appendChatMessage(msg, false);
  });
}

async function handleAccept(meetingId) {
  try {
    const res = await fetch(`${MEETINGS_API_BASE}/${meetingId}/accept`, { method: 'PUT', headers: authHeaders() });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to accept');
    await loadConversations();
    if (state.activeCounterpartId) openConversation(state.activeCounterpartId);
  } catch (e) { alert(e.message || 'Failed to accept'); }
}

async function handleReject(meetingId) {
  try {
    const res = await fetch(`${MEETINGS_API_BASE}/${meetingId}/reject`, { method: 'PUT', headers: authHeaders() });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to reject');
    await loadConversations();
    if (state.activeCounterpartId) openConversation(state.activeCounterpartId);
  } catch (e) { alert(e.message || 'Failed to reject'); }
}

document.addEventListener('DOMContentLoaded', loadConversations);
