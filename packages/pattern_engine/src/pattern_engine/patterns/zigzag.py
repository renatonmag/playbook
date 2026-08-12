class ZigZagIndidicator:
    def __init__(self, data, depth):
        """
        Initializes the ZigZag indicator with a list of candle data and a specified depth.

        :param data: List of dictionaries representing candle data.
        :param depth: Integer representing the depth for finding extremes.
        """
        self._data = data.copy()
        self._depth = depth
        self._size = len(self._data)
        self._initialize_arrays()

    def _initialize_arrays(self):
        self.highs = [None] * self._size
        self.lows = [None] * self._size
        self.start = [None] * self._size
        self.zz = [None] * self._size

    def _find_extremes(self):
        if self._size == 0:
            return

        last_high = self._data[0]["high"]
        last_low = self._data[0]["low"]
        last_high_idx = last_low_idx = 0
        leg_up = leg_down = False

        # Adjusted loop to include the last candle
        for idx in range(self._depth, self._size + 1):
            if idx < self._size:
                window = self._data[
                    idx - self._depth : idx
                ]
                current_max = max(
                    candle["high"] for candle in window
                )
                current_min = min(
                    candle["low"] for candle in window
                )

                self._update_highs_lows(
                    idx,
                    current_max,
                    current_min,
                    last_high,
                    last_low,
                )

                if last_high != current_max:
                    last_high = current_max
                    last_high_idx = idx - 1
                if last_low != current_min:
                    last_low = current_min
                    last_low_idx = idx - 1

                leg_up, leg_down = self._update_legs(
                    idx,
                    last_high_idx,
                    last_low_idx,
                    leg_up,
                    leg_down,
                )
            else:
                # Handle the last candle by considering the final window
                window = self._data[
                    idx - self._depth : idx
                ]
                current_max = max(
                    candle["high"] for candle in window
                )
                current_min = min(
                    candle["low"] for candle in window
                )

                self._update_highs_lows(
                    idx,
                    current_max,
                    current_min,
                    last_high,
                    last_low,
                )

                # Update legs if necessary
                if last_high != current_max:
                    last_high = current_max
                    last_high_idx = idx - 1
                if last_low != current_min:
                    last_low = current_min
                    last_low_idx = idx - 1

                leg_up, leg_down = self._update_legs(
                    idx,
                    last_high_idx,
                    last_low_idx,
                    leg_up,
                    leg_down,
                )

        self._cleanup_extremes()

    def _update_highs_lows(
        self,
        idx,
        current_max,
        current_min,
        last_high,
        last_low,
    ):
        if idx < self._size:
            previous_candle = self._data[idx - 1]
            if (
                current_max == previous_candle["high"]
                and last_high != current_max
            ):
                self.highs[idx - 1] = current_max
            if (
                current_min == previous_candle["low"]
                and last_low != current_min
            ):
                self.lows[idx - 1] = current_min
        else:
            # For the extended index, check the last candle
            previous_candle = self._data[-1]
            if (
                current_max == previous_candle["high"]
                and last_high != current_max
            ):
                self.highs[-1] = current_max
            if (
                current_min == previous_candle["low"]
                and last_low != current_min
            ):
                self.lows[-1] = current_min

    def _update_legs(
        self,
        idx,
        last_high_idx,
        last_low_idx,
        leg_up,
        leg_down,
    ):
        if not leg_up and last_high_idx < last_low_idx:
            self.start[last_low_idx] = self.lows[
                last_low_idx
            ]
            leg_up, leg_down = True, False
        elif not leg_down and last_low_idx < last_high_idx:
            self.start[last_high_idx] = self.highs[
                last_high_idx
            ]
            leg_up, leg_down = False, True
        return leg_up, leg_down

    def _cleanup_extremes(self):
        for idx in range(self._size):
            self._cleanup_highs(idx)
            self._cleanup_lows(idx)

    def _cleanup_highs(self, idx):
        if self.highs[idx] is not None:
            self.zz[idx] = self.highs[idx]
            for last in reversed(range(idx)):
                if self._cleanup_condition(
                    last, idx, self.highs
                ):
                    break

    def _cleanup_lows(self, idx):
        if self.lows[idx] is not None:
            self.zz[idx] = self.lows[idx]
            for last in reversed(range(idx)):
                if self._cleanup_condition(
                    last, idx, self.lows
                ):
                    break

    def _cleanup_condition(self, last, idx, arr):
        if self.zz[last] is not None:
            if self.zz[last] != arr[last]:
                return True
            if (
                arr is self.highs
                and self.zz[last] >= self.zz[idx]
            ) or (
                arr is self.lows
                and self.zz[last] <= self.zz[idx]
            ):
                self.zz[idx] = None
                arr[idx] = None
                return True
            else:
                self.zz[last] = None
                arr[last] = None
                return True
        return False

    def _finalize_data(self):
        finalized_data = []
        for idx in range(self._size):
            entry = {
                "zz": self.zz[idx],
                "lows": self.lows[idx],
                "highs": self.highs[idx],
                "start": self.start[idx],
            }
            finalized_data.append(entry)
        refined_data = self._refine_start_points(
            finalized_data
        )
        return refined_data

    def _refine_start_points(self, data):
        zz_valid = [
            i
            for i, entry in enumerate(data)
            if entry["zz"] is not None
        ]
        for idx in range(len(zz_valid) - 1):
            current_idx = zz_valid[idx]
            next_idx = zz_valid[idx + 1]
            for j in range(current_idx + 1, next_idx):
                if data[j]["start"] is not None:
                    data[j]["start"] = None
        return data

    def __call__(self):
        self._find_extremes()
        return self._finalize_data()

    @staticmethod
    def zz_direction(entry):
        if entry["zz"] is not None:
            if entry["zz"] == entry["highs"]:
                return -1
            else:
                return 1
        return 0