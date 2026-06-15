import socket
import struct
import asyncio
from config import UDP_MULTICAST_GROUP, UDP_MULTICAST_PORT, UDP_BUFFER_SIZE


class UDPMulticastReceiver:
    def __init__(self, group=UDP_MULTICAST_GROUP, port=UDP_MULTICAST_PORT):
        self.group = group
        self.port = port
        self.sock = None
        self._callback = None
        self._running = False

    def set_callback(self, cb):
        self._callback = cb

    def start(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(('', self.port))
        mreq = struct.pack('4s4s', socket.inet_aton(self.group), socket.inet_aton('0.0.0.0'))
        self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, UDP_BUFFER_SIZE)
        self._running = True
        loop = asyncio.get_event_loop()
        loop.create_task(self._recv_loop())

    async def _recv_loop(self):
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                data, _ = await loop.sock_recvfrom(self.sock, UDP_BUFFER_SIZE)
                if self._callback and len(data) >= 44:
                    await self._callback(data)
            except Exception as e:
                print(f'[UDP recv error] {e}')
                await asyncio.sleep(0.001)

    def stop(self):
        self._running = False
        if self.sock:
            self.sock.close()
