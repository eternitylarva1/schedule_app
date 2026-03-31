"""LLM service for natural language processing."""
import aiohttp
import asyncio
import json
import os
from typing import Optional, Dict, Any


class LLMService:
    """OpenAI-compatible LLM service."""
    
    def __init__(self):
        # 支持环境变量配置或硬编码默认值
        self.api_base = os.getenv("LLM_API_BASE", "https://open.cherryin.net/v1")
        self.api_key = os.getenv("LLM_API_KEY", "sk-nzCBqwmTVmDj137YyfMVKp1xAAVv0Pc2YrXHpHqwILKpDEEw")
        self.model = os.getenv("LLM_MODEL", "minimax/minimax-m2.5-highspeed")
    
    async def chat(self, messages: list, temperature: float = 0.7) -> Optional[str]:
        """Send chat request to LLM API."""
        if not self.api_key:
            return None
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_base}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        content = data["choices"][0]["message"]["content"]
                        print(f"LLM response: {content[:200]}")
                        return content
                    else:
                        error_text = await resp.text()
                        print(f"LLM API error: {resp.status} - {error_text}")
                        return None
        except asyncio.TimeoutError:
            print(f"LLM request timeout after 60s")
            return None
        except Exception as e:
            print(f"LLM request failed: {type(e).__name__}: {e}")
            return None
    
    async def process_schedule_command(self, user_text: str) -> Optional[Dict[str, Any]]:
        """Process natural language schedule command.
        
        Returns structured event data or None if failed.
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        prompt = f"""用户想要创建日程，请解析并返回JSON数组格式。

当前日期：{current_date} {current_time}
用户输入：{user_text}

请分析用户输入，如果包含多个时间段的安排（如"先去...然后...接着..."），请解析出多个日程。
如果只有单一安排，就返回一个日程。

返回JSON数组格式（只返回JSON，不要其他内容）：
{{
    "events": [
{{
    "title": "日程标题（提取核心任务，去除时间描述）",
    "start_time": "ISO格式开始时间，如2026-04-01T15:00:00",
    "duration_minutes": 预估分钟数,
    "category_id": "work/life/study/health之一"
}},
... 更多日程
]
}}

规则：
- "今天"就是{current_date}
- "先去A，30分钟后去B" → 第一个日程从当前时间开始，第二个从第一个结束后开始
- "上午...下午..." → 上午日程在9:00-12:00，下午在14:00-18:00
- 只提取任务名称，不要时间描述在标题里
- category推断：工作→work，生活→life，学习→study，运动健康→health
"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个日程管理助手，帮助用户解析自然语言并创建多个日程。"},
            {"role": "user", "content": prompt}
        ])
        
        if not response:
            return None
        
        # Extract JSON from response
        try:
            # Try to find JSON array in the response
            json_start = response.find('[')
            json_end = response.rfind(']') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                events_data = json.loads(json_str)
                # Return as array - caller will handle creating multiple events
                return {"events": events_data}
            
            # Try single object
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return {"events": [json.loads(json_str)]}
        except json.JSONDecodeError:
            pass
        
        return None

    async def breakdown_task(self, user_text: str) -> Optional[Dict[str, Any]]:
        """Break down a complex task into subtasks.
        
        Returns dict with subtasks array or None if failed.
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        prompt = f"""用户想要将一个复杂任务分解为多个子任务，请分析并返回JSON格式。

当前日期：{current_date} {current_time}
任务：{user_text}

请将任务分解为多个可执行的子任务，返回JSON格式：
{{
    "subtasks": [
        {{
            "title": "子任务1名称",
            "start_time": "HH:MM 格式的开始时间",
            "duration_minutes": 预估分钟数,
            "category_id": "work/life/study/health"
        }},
        ...
    ]
}}

规则：
- 根据任务复杂度分解为2-5个步骤
- 每个步骤有明确的开始时间和时长
- 时间用HH:MM格式（如"09:00"、"14:30"）
- 如果没明确时间，根据任务逻辑推断合理时间
- category推断：工作→work，生活→life，学习→study，休息→health
"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个任务分解专家，帮助用户将复杂任务分解为简单的可执行步骤。"},
            {"role": "user", "content": prompt}
        ])
        
        if not response:
            return None
        
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
        except json.JSONDecodeError:
            pass
        
        return None


# Global instance
llm_service = LLMService()
