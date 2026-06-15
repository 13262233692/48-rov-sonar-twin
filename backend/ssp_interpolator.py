import numpy as np
from scipy.interpolate import CubicSpline
from config import SSP_PROFILE


class SSPInterpolator:
    def __init__(self, profile=SSP_PROFILE):
        depths = np.array([p[0] for p in profile], dtype=np.float64)
        speeds = np.array([p[1] for p in profile], dtype=np.float64)
        self.max_depth = depths[-1]
        self.min_depth = depths[0]
        self.cs = CubicSpline(depths, speeds, bc_type='natural')
        self._integral_cache = {}

    def sound_speed(self, depth):
        d = np.clip(depth, self.min_depth, self.max_depth)
        return self.cs(d)

    def _snell_constant(self, launch_angle_rad, surface_speed):
        return np.cos(launch_angle_rad) / surface_speed

    def trace_ray(self, tof_sec, launch_angle_rad, rov_depth):
        n = 200
        dt = tof_sec / n
        c0 = self.sound_speed(rov_depth)
        p = self._snell_constant(launch_angle_rad, c0)

        x = 0.0
        z = 0.0
        depth_cur = rov_depth
        theta_cur = launch_angle_rad
        t_sofar = 0.0

        for _ in range(n):
            c = self.cs(np.clip(depth_cur, self.min_depth, self.max_depth))
            cos_t = p * c
            cos_t = np.clip(cos_t, -1.0, 1.0)
            theta_cur = np.arccos(cos_t)
            ds = c * dt
            dx = ds * np.sin(theta_cur)
            dz = ds * np.cos(theta_cur)
            x += dx
            z += dz
            depth_cur = rov_depth + z
            t_sofar += dt
            if depth_cur < self.min_depth or depth_cur > self.max_depth:
                break

        range_estimate = x
        depth_estimate = z
        return range_estimate, depth_estimate

    def compute_ranges(self, tof_us_arr, beam_angles_rad, rov_depth):
        tof_sec = tof_us_arr * 1e-6 * 0.5
        ranges = np.zeros_like(tof_sec)
        depths = np.zeros_like(tof_sec)

        for i in range(len(tof_sec)):
            if tof_sec[i] <= 0:
                ranges[i] = 0
                depths[i] = 0
                continue
            r, d = self.trace_ray(tof_sec[i], beam_angles_rad[i], rov_depth)
            ranges[i] = r
            depths[i] = d
        return ranges, depths
