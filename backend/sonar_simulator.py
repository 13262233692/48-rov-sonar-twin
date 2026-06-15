import socket
import struct
import time
import random
import math
import numpy as np
from config import UDP_MULTICAST_GROUP, UDP_MULTICAST_PORT, PACKET_STRUCT, SONAR_BEAM_COUNT


class SonarSimulator:
    MAGIC = 0x534F4E41

    def __init__(self, group=UDP_MULTICAST_GROUP, port=UDP_MULTICAST_PORT):
        self.group = group
        self.port = port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        self.ping_id = 0
        self.t0 = time.time()

    def _quat_from_euler(self, roll, pitch, yaw):
        cr = math.cos(roll * 0.5)
        sr = math.sin(roll * 0.5)
        cp = math.cos(pitch * 0.5)
        sp = math.sin(pitch * 0.5)
        cy = math.cos(yaw * 0.5)
        sy = math.sin(yaw * 0.5)
        w = cr * cp * cy + sr * sp * sy
        x = sr * cp * cy - cr * sp * sy
        y = cr * sp * cy + sr * cp * sy
        z = cr * cp * sy - sr * sp * cy
        return [w, x, y, z]

    def _cave_profile(self, beam_angle_rad, rov_pos, t):
        half_swath = math.radians(60)
        rel = beam_angle_rad / half_swath
        base_range = 15.0 + 8.0 * math.sin(t * 0.3 + rov_pos[0] * 0.1 + beam_angle_rad * 3.0)
        wall_curve = 3.0 * math.sin(rel * 2.1 + t * 0.5)
        stalactite = max(0.0, -4.0 * math.sin(rel * 4.0 + t * 0.7)) ** 2 * 0.5
        noise = random.uniform(-0.25, 0.25)
        return max(1.5, base_range + wall_curve - stalactite + noise)

    def _tof_from_range(self, r_m, sound_speed=1470.0):
        return int((2.0 * r_m / sound_speed) * 1e9)

    def build_packet(self):
        self.ping_id += 1
        t = time.time() - self.t0

        rov_x = 2.0 * math.sin(t * 0.2)
        rov_y = 1.5 * math.cos(t * 0.15)
        rov_z = 20.0 + 3.0 * math.sin(t * 0.1)
        roll = math.radians(5.0 * math.sin(t * 0.6))
        pitch = math.radians(8.0 * math.sin(t * 0.4 + 0.3))
        yaw = math.radians(20.0 * t * 0.05)
        q = self._quat_from_euler(roll, pitch, yaw)

        header_size = PACKET_STRUCT['header_size']
        beam_count = SONAR_BEAM_COUNT
        entry_size = PACKET_STRUCT['beam_entry_size']
        total = header_size + beam_count * entry_size
        buf = bytearray(total)

        struct.pack_into('<I', buf, 0, self.MAGIC)
        struct.pack_into('<Q', buf, 4, int(time.time() * 1e6))
        struct.pack_into('<H', buf, 12, self.ping_id & 0xFFFF)
        struct.pack_into('<H', buf, 14, beam_count)
        struct.pack_into('<f', buf, 16, q[0])
        struct.pack_into('<f', buf, 20, q[1])
        struct.pack_into('<f', buf, 24, q[2])
        struct.pack_into('<f', buf, 28, q[3])
        struct.pack_into('<f', buf, 32, rov_x)
        struct.pack_into('<f', buf, 36, rov_y)
        struct.pack_into('<f', buf, 40, rov_z)

        half_swath = math.radians(60)
        angles = np.linspace(-half_swath, half_swath, beam_count)
        for i in range(beam_count):
            r = self._cave_profile(angles[i], (rov_x, rov_y, rov_z), t)
            tof = self._tof_from_range(r)
            amp = int((0.6 + 0.4 * random.random()) * 4294967295.0 * (1.0 / max(1.0, r * 0.07)))
            off = header_size + i * entry_size
            struct.pack_into('<I', buf, off, tof)
            struct.pack_into('<I', buf, off + 4, min(amp, 4294967295))

        return bytes(buf)

    def send_once(self):
        pkt = self.build_packet()
        self.sock.sendto(pkt, (self.group, self.port))

    def close(self):
        self.sock.close()
