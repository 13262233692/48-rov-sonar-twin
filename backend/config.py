import struct

UDP_MULTICAST_GROUP = '239.255.0.1'
UDP_MULTICAST_PORT = 5004
UDP_BUFFER_SIZE = 65536

WS_HOST = '0.0.0.0'
WS_PORT = 8765

SONAR_BEAM_COUNT = 256
SONAR_SWATH_ANGLE_DEG = 120.0
SONAR_PING_RATE_HZ = 10

SSP_PROFILE = [
    (0.0, 1450.0),
    (10.0, 1452.0),
    (25.0, 1458.0),
    (50.0, 1468.0),
    (75.0, 1478.0),
    (100.0, 1485.0),
    (150.0, 1492.0),
    (200.0, 1496.0),
]

PACKET_STRUCT = {
    'magic': (0, 4, 'I'),
    'timestamp': (4, 8, 'Q'),
    'ping_id': (12, 2, 'H'),
    'beam_count': (14, 2, 'H'),
    'rov_qw': (16, 4, 'f'),
    'rov_qx': (20, 4, 'f'),
    'rov_qy': (24, 4, 'f'),
    'rov_qz': (28, 4, 'f'),
    'rov_px': (32, 4, 'f'),
    'rov_py': (36, 4, 'f'),
    'rov_pz': (40, 4, 'f'),
    'header_size': 44,
    'beam_entry_size': 8,
}

def unpack_field(data, offset, size, fmt):
    return struct.unpack('<' + fmt, data[offset:offset + size])[0]
