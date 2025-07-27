const ws = new WebSocket('ws://localhost:8080/ws');
const messages = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  let text;
  if (msg.type === "mud") {
    // For mud messages, just show the data without prefix
    text = `${msg.data}\n`;
  } else {
    // For other message types, keep the prefix
    text = `[${msg.type}] ${msg.data ? msg.data : msg.message || msg.error || msg.raw}\n`;
  }
  messages.textContent += text;
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