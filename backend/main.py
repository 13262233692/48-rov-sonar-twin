import asyncio
import signal
import sys
import time

from config import SONAR_PING_RATE_HZ
from udp_receiver import UDPMulticastReceiver
from packet_parser import SonarPacketParser
from ssp_interpolator import SSPInterpolator
from ws_server import WebSocketBroadcaster
from sonar_simulator import SonarSimulator


class ROVSonarGateway:
    def __init__(self, simulate=True):
        self.simulate = simulate
        self.parser = SonarPacketParser()
        self.ssp = SSPInterpolator()
        self.ws = WebSocketBroadcaster()
        self.udp = UDPMulticastReceiver()
        self.sim = SonarSimulator() if simulate else None
        self._running = True

    async def _sim_loop(self):
        interval = 1.0 / SONAR_PING_RATE_HZ
        while self._running and self.sim:
            self.sim.send_once()
            await asyncio.sleep(interval)

    async def _handle_packet(self, raw):
        parsed = self.parser.parse(raw)
        if not parsed:
            return
        rov_depth = parsed['rov_pos'][2]
        ranges, depth_deltas = self.ssp.compute_ranges(
            parsed['tof_us'], parsed['beam_angles'], rov_depth
        )
        payload = {
            'type': 'sonar_ping',
            'timestamp': parsed['timestamp'],
            'ping_id': parsed['ping_id'],
            'rov': {
                'quat': parsed['rov_quat'].tolist(),
                'pos': parsed['rov_pos'].tolist(),
            },
            'beams': {
                'count': len(ranges),
                'angles_rad': parsed['beam_angles'].tolist(),
                'ranges_m': ranges.tolist(),
                'depth_deltas_m': depth_deltas.tolist(),
                'intensity': parsed['intensity'].tolist(),
            }
        }
        await self.ws.broadcast_json(payload)

    async def start(self):
        await self.ws.start()
        self.udp.set_callback(self._handle_packet)
        self.udp.start()
        if self.simulate:
            print('[Gateway] simulation mode enabled')
            asyncio.create_task(self._sim_loop())
        print('[Gateway] started successfully')

        try:
            while self._running:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            await self.shutdown()

    async def shutdown(self):
        self._running = False
        self.udp.stop()
        if self.sim:
            self.sim.close()
        await self.ws.stop()
        print('[Gateway] shutdown complete')


def main():
    simulate = '--no-sim' not in sys.argv
    gw = ROVSonarGateway(simulate=simulate)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def _signal(sig, frame):
        for task in asyncio.all_tasks(loop):
            task.cancel()
        loop.call_soon_threadsafe(loop.stop)

    signal.signal(signal.SIGINT, _signal)
    signal.signal(signal.SIGTERM, _signal)

    try:
        loop.run_until_complete(gw.start())
    except KeyboardInterrupt:
        pass
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        finally:
            loop.close()


if __name__ == '__main__':
    main()
