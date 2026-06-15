import asyncio
import json
import websockets
from config import WS_HOST, WS_PORT


class WebSocketBroadcaster:
    def __init__(self, host=WS_HOST, port=WS_PORT):
        self.host = host
        self.port = port
        self.clients = set()
        self._server = None

    async def _register(self, websocket):
        self.clients.add(websocket)
        print(f'[WS] client connected, total={len(self.clients)}')
        try:
            await websocket.wait_closed()
        finally:
            self.clients.remove(websocket)
            print(f'[WS] client disconnected, total={len(self.clients)}')

    async def broadcast(self, payload):
        if not self.clients:
            return
        dead = set()
        for ws in self.clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def broadcast_json(self, data):
        msg = json.dumps(data, default=lambda x: float(x) if hasattr(x, '__float__') else x.tolist() if hasattr(x, 'tolist') else x)
        await self.broadcast(msg)

    async def start(self):
        async def _handler(ws):
            await self._register(ws)
        self._server = await websockets.serve(_handler, self.host, self.port)
        print(f'[WS] server listening on {self.host}:{self.port}')

    async def stop(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()
