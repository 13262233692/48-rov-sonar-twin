import struct
import numpy as np
from config import PACKET_STRUCT, unpack_field, SONAR_BEAM_COUNT, SONAR_SWATH_ANGLE_DEG


class SonarPacketParser:
    def __init__(self, beam_count=SONAR_BEAM_COUNT, swath_angle_deg=SONAR_SWATH_ANGLE_DEG):
        self.beam_count = beam_count
        self.swath_half = np.radians(swath_angle_deg * 0.5)
        self.beam_angles = np.linspace(-self.swath_half, self.swath_half, beam_count, dtype=np.float64)
        self.MAGIC_EXPECTED = 0x534F4E41

    def parse(self, raw: bytes):
        magic = unpack_field(raw, *PACKET_STRUCT['magic'])
        if magic != self.MAGIC_EXPECTED:
            return None

        timestamp = unpack_field(raw, *PACKET_STRUCT['timestamp'])
        ping_id = unpack_field(raw, *PACKET_STRUCT['ping_id'])
        beam_count = unpack_field(raw, *PACKET_STRUCT['beam_count'])

        rov_quat = np.array([
            unpack_field(raw, *PACKET_STRUCT['rov_qw']),
            unpack_field(raw, *PACKET_STRUCT['rov_qx']),
            unpack_field(raw, *PACKET_STRUCT['rov_qy']),
            unpack_field(raw, *PACKET_STRUCT['rov_qz']),
        ], dtype=np.float64)

        rov_pos = np.array([
            unpack_field(raw, *PACKET_STRUCT['rov_px']),
            unpack_field(raw, *PACKET_STRUCT['rov_py']),
            unpack_field(raw, *PACKET_STRUCT['rov_pz']),
        ], dtype=np.float64)

        header_size = PACKET_STRUCT['header_size']
        entry_size = PACKET_STRUCT['beam_entry_size']

        tof_us = np.zeros(beam_count, dtype=np.float64)
        intensity = np.zeros(beam_count, dtype=np.float64)

        for i in range(min(beam_count, self.beam_count)):
            off = header_size + i * entry_size
            t = struct.unpack('<I', raw[off:off + 4])[0]
            amp = struct.unpack('<I', raw[off + 4:off + 8])[0]
            tof_us[i] = t * 0.001
            intensity[i] = amp / 4294967295.0

        return {
            'timestamp': timestamp,
            'ping_id': ping_id,
            'beam_count': beam_count,
            'rov_quat': rov_quat,
            'rov_pos': rov_pos,
            'beam_angles': self.beam_angles[:beam_count],
            'tof_us': tof_us[:beam_count],
            'intensity': intensity[:beam_count],
        }
