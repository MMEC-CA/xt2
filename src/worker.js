// Worker entry: routes WebSocket signaling to a Durable Object,
// otherwise serves static assets from ./_site.
//
// This file is intentionally repo-name-agnostic. Any URL ending in
// /api/signal/ws (e.g. /ae3/api/signal/ws) routes to the DO.

import { SignalingRoom } from './signaling-do.js';
export { SignalingRoom };

function normalizeIPtoRoom(ip) {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (ip.includes('::')) {
      const halves = ip.split('::');
      const left = halves[0] ? halves[0].split(':') : [];
      const right = halves[1] ? halves[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      const expanded = [...left, ...Array(missing).fill('0'), ...right];
      return `room:v6:${expanded.slice(0, 3).join('-')}`;
    }
    return `room:v6:${parts.slice(0, 3).join('-')}`;
  }
  return `room:v4:${ip.replace(/\./g, '-')}`;
}

const CHOICES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function playRPS(player) {
  const computer = CHOICES[Math.floor(Math.random() * 3)];
  let result;
  if (player === computer) result = 'draw';
  else if (BEATS[player] === computer) result = 'win';
  else result = 'lose';
  return { player, computer, result };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/api/game/rps')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
      }
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      }
      let body;
      try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
      const choice = (body.choice || '').toLowerCase();
      if (!CHOICES.includes(choice)) {
        return new Response(JSON.stringify({ error: 'choice must be rock, paper, or scissors' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      return new Response(JSON.stringify(playRPS(choice)), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (url.pathname.endsWith('/api/signal/ws')) {
      if (!env.SIGNALING_ROOM) {
        return new Response(JSON.stringify({ error: 'Durable Objects not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const roomParam = url.searchParams.get('room');
      let roomName;
      if (roomParam) {
        roomName = `room:code:${roomParam.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 20)}`;
      } else {
        const ip =
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for') ||
          '127.0.0.1';
        roomName = normalizeIPtoRoom(ip);
      }

      const id = env.SIGNALING_ROOM.idFromName(roomName);
      const stub = env.SIGNALING_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
