const ws = new WebSocket('ws://localhost:8080/ws');
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  const div = document.createElement('div');
  div.textContent = `[${msg.type}] ${msg.data ? JSON.stringify(msg.data) : msg.message || msg.error || msg.raw}`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
};

sendBtn.onclick = send;
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send();
});

function send() {
  if (input.value.trim()) {
    ws.send(input.value);
    input.value = '';
  }
} 