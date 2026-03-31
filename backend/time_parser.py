"""Natural language time parser for schedule input."""
import re
from datetime import datetime, timedelta
from typing import Optional, Tuple


class TimeParser:
    """Parse natural language time expressions."""

    @staticmethod
    def parse(text: str) -> Optional[Tuple[datetime, Optional[datetime]]]:
        """Parse natural language text and return (start_time, end_time).
        
        Examples:
        - "明天下午3点开会2小时" -> (tomorrow 15:00, tomorrow 17:00)
        - "今天晚上8点锻炼" -> (today 20:00, None)
        - "每天早上7点跑步" -> (today 7:00, None)
        - "下周一上午10点开会" -> (next Monday 10:00, None)
        """
        text = text.strip()
        now = datetime.now()
        
        # Detect date reference
        date_offset = TimeParser._parse_date(text)
        base_date = now + timedelta(days=date_offset) if date_offset else now
        base_date = base_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Parse time
        time_result = TimeParser._parse_time(text, base_date)
        if not time_result:
            return None
        
        start_time, duration_minutes = time_result
        
        # Calculate end time
        end_time = None
        if duration_minutes:
            end_time = start_time + timedelta(minutes=duration_minutes)
        
        return start_time, end_time

    @staticmethod
    def _parse_date(text: str) -> Optional[int]:
        """Parse date reference in text."""
        text_lower = text.lower()
        
        # Today
        if "今天" in text or "今日" in text:
            return 0
        
        # Tomorrow
        if "明天" in text or "明日" in text:
            return 1
        
        # Day after tomorrow
        if "后天" in text or "后日" in text:
            return 2
        
        # Yesterday
        if "昨天" in text or "昨日" in text:
            return -1
        
        # This week days
        weekday_map = {
            "周一": 0, "周一": 0,
            "周二": 1, "周二": 1,
            "周三": 2, "周三": 2,
            "周四": 3, "周四": 3,
            "周五": 4, "周五": 4,
            "周六": 5, "周六": 5,
            "周日": 6, "周日": 6,
        }
        
        # Next week
        next_week_match = re.search(r"下下周一|下下周二|下下周三|下下周四|下下周五|下下周六|下下周日", text_lower)
        if next_week_match:
            day_text = next_week_match.group()
            base_day = day_text[-2:]
            if base_day in weekday_map:
                days_ahead = (weekday_map[base_day] - datetime.now().weekday() + 14) % 14
                if days_ahead == 0:
                    days_ahead = 14
                return days_ahead
        
        # This week days
        for day, day_num in weekday_map.items():
            if day in text:
                days_ahead = (day_num - datetime.now().weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7  # Next occurrence
                return days_ahead
        
        return 0  # Default to today

    @staticmethod
    def _parse_time(text: str, base_date: datetime) -> Optional[Tuple[datetime, Optional[int]]]:
        """Parse time and duration from text."""
        # Patterns for time: "3点", "15:30", "下午3点", "早上7点"
        
        # Time patterns
        time_patterns = [
            # "下午3点", "下午3点半", "下午3点30分"
            r"下午(\d{1,2})点(?:半|点(\d{1,2})分?)?",
            # "上午9点", "上午9点半"
            r"上午(\d{1,2})点(?:半|点(\d{1,2})分?)?",
            # "晚上8点", "晚上8点半"
            r"晚上(\d{1,2})点(?:半|点(\d{1,2})分?)?",
            # "早上7点"
            r"早上(\d{1,2})点(?:半|点(\d{1,2})分?)?",
            # "中午12点"
            r"中午(\d{1,2})点(?:半|点(\d{1,2})分?)?",
            # "3点", "15:30"
            r"(\d{1,2}):(\d{2})",
            # "3点", "15点"
            r"(\d{1,2})点(?:半|点(\d{1,2})分?)?",
        ]
        
        hour = None
        minute = 0
        
        for pattern in time_patterns:
            match = re.search(pattern, text)
            if match:
                groups = match.groups()
                if pattern == r"(\d{1,2}):(\d{2})":
                    hour = int(groups[0])
                    minute = int(groups[1])
                elif "下午" in pattern or "晚上" in pattern:
                    hour = int(groups[0])
                    if hour < 12:
                        hour += 12
                    if groups[1] == "半":
                        minute = 30
                    elif groups[1]:
                        minute = int(groups[1])
                elif "上午" in pattern or "早上" in pattern or "中午" in pattern:
                    hour = int(groups[0])
                    if groups[1] == "半":
                        minute = 30
                    elif groups[1]:
                        minute = int(groups[1])
                else:
                    hour = int(groups[0])
                    if groups[1] == "半":
                        minute = 30
                    elif groups[1]:
                        minute = int(groups[1])
                break
        
        if hour is None:
            return None
        
        # Parse duration
        duration = TimeParser._parse_duration(text)
        
        start_time = base_date.replace(hour=hour, minute=minute)
        return start_time, duration

    @staticmethod
    def _parse_duration(text: str) -> Optional[int]:
        """Parse duration in minutes."""
        text_lower = text.lower()
        
        # "2小时", "2小时30分钟"
        hour_match = re.search(r"(\d+)\s*小时", text_lower)
        # "30分钟", "30分"
        min_match = re.search(r"(\d+)\s*(?:分钟|分)", text_lower)
        
        total_minutes = 0
        if hour_match:
            total_minutes += int(hour_match.group(1)) * 60
        if min_match:
            total_minutes += int(min_match.group(1))
        
        return total_minutes if total_minutes > 0 else None


def parse_time(text: str) -> Optional[Tuple[datetime, Optional[datetime]]]:
    """Convenience function for time parsing."""
    return TimeParser.parse(text)


if __name__ == "__main__":
    # Test cases
    test_cases = [
        "明天下午3点开会2小时",
        "今天晚上8点锻炼",
        "每天早上7点跑步",
        "明天上午9点",
        "今天下午4点半",
        "下周一上午10点开会",
        "今晚9点",
    ]
    
    for tc in test_cases:
        result = parse_time(tc)
        print(f"{tc} -> {result}")