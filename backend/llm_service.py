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
    
    async def chat(self, messages: list[dict[str, Any]], temperature: float = 0.7) -> Optional[str]:
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

    async def breakdown_task(self, user_text: str, horizon: str = "short", self_description: str = "") -> Optional[Dict[str, Any]]:
        """Break down a complex task into subtasks.
        
        Returns dict with subtasks array or None if failed.
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        horizon_hint = {
            "short": "短期目标（通常1-7天）",
            "semester": "学期目标（通常1-6个月）",
            "long": "长期目标（通常6个月以上）",
        }.get(horizon, "短期目标（通常1-7天）")

        # Build context section
        context_section = ""
        if self_description:
            context_section = f"""
用户现状背景：{self_description}

"""

        prompt = f"""用户想要将一个复杂任务分解为多个子任务，请分析并返回JSON格式。

当前日期：{current_date} {current_time}
规划层级：{horizon_hint}
任务：{user_text}
{context_section}请将任务分解为多个可执行的子任务，返回JSON格式：
{{
    "subtasks": [
        {{
            "title": "子任务1名称",
            "date": "YYYY-MM-DD 格式的日期，如2026-04-03",
            "start_time": "HH:MM 格式的开始时间",
            "duration_minutes": 预估分钟数,
            "category_id": "work/life/study/health"
        }},
        ...
    ]
}}

规则：
- 根据任务复杂度分解为2-8个步骤
- 如果任务横跨多天（如"准备旅行需要3天"），应将步骤分散到不同日期
- 若是短期目标：步骤要具体到可直接执行
- 若是学期目标：步骤按阶段推进，强调里程碑
- 若是长期目标：步骤先给阶段方向，再给近期可执行动作
- 每个步骤有明确的日期、开始时间和时长
- 日期用YYYY-MM-DD格式（如"2026-04-03"）
- 时间用HH:MM格式（如"09:00"、"14:30"）
- 如果没明确时间，根据任务逻辑推断合理时间
- 注意日期不应全部相同，应根据任务自然分布到不同天
- category推断：工作→work，生活→life，学习→study，运动健康→health
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

    async def discuss_goal(
        self,
        goal_content: str,
        user_input: str,
        history_context: str,
        self_description: str,
        week_events: str,
        todo_items: str
    ) -> Optional[Dict[str, Any]]:
        """Conversational goal breakdown - asks questions and generates subtasks.
        
        Returns dict with:
        - type: "question" or "subtasks"
        - message: AI's question or summary
        - subtasks: list of subtasks (if type is "subtasks")
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        # Build context
        context = f"""
## 用户背景
{self_description if self_description else "用户未提供背景介绍"}

## 本周日程
{week_events if week_events else "本周暂无安排"}

## 当前待办
{todo_items if todo_items else "暂无待办"}

## 对话历史
{history_context if history_context else "（暂无对话历史）"}
"""
        
        # Build user message
        if goal_content and not user_input:
            # First message - user just shared their goal
            user_message = f"""用户的初步目标：{goal_content}

请分析这个目标，判断信息是否足够拆解。
如果需要更多信息（比如目的、时间范围、投入时间等），请提出1-2个最关键的问题。
如果信息已经足够，直接返回子任务拆解方案。

回复格式：
- 如果需要提问：直接问问题，不要其他内容
- 如果直接拆解：返回JSON格式的子任务列表"""
        else:
            # User is responding to a question
            user_message = f"""用户的初步目标：{goal_content}

用户回答：{user_input}

请根据用户的回答：
1. 判断信息是否足够
2. 如果还需要更多细节，再问1个问题
3. 如果信息足够，返回子任务拆解方案

回复格式：
- 如果继续提问：直接问问题
- 如果信息足够：返回JSON格式的子任务列表

子任务JSON格式：
{{
    "subtasks": [
        {{
            "title": "子任务名称",
            "duration_hint": "预计时长提示，如'2-3小时'或'1天'"
        }},
        ...
    ],
    "summary": "整体计划总结"
}}
"""
        
        system_prompt = """你是一个任务规划助手，通过友好对话帮助用户拆解目标。

你的工作方式：
1. 先通过1-2个关键问题了解用户的目标背景
2. 根据回答继续提问或生成拆解方案
3. 拆解时要考虑用户的时间安排，避免与已有日程冲突

提问原则：
- 只问最关键的问题，不要一次性问太多
- 问题要具体、有意义
- 用户背景和日程会作为参考，但要针对性提问

拆解原则：
- 子任务要具体可执行
- 标注每个任务的预计时长
- 3层结构：目标 -> 子任务 -> 子子任务（最多3层）
- 子任务数量控制在3-8个"""

        response = await self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
            {"role": "user", "content": user_message}
        ], temperature=0.7)
        
        if not response:
            return None
        
        # Check if response is a question or subtasks
        response = response.strip()
        
        # If response contains JSON, it's subtasks
        if '{' in response and 'subtasks' in response.lower():
            try:
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = response[json_start:json_end]
                    result = json.loads(json_str)
                    return {
                        "type": "subtasks",
                        "message": result.get("summary", "任务拆解完成"),
                        "subtasks": result.get("subtasks", [])
                    }
            except json.JSONDecodeError:
                pass
        
        # Otherwise it's a question
        return {
            "type": "question",
            "message": response,
            "subtasks": []
        }

    async def parse_expense(self, user_text: str) -> Optional[Dict[str, Any]]:
        """Parse natural language expense into structured data.
        
        Returns dict with:
        - amount: float (金额)
        - category: str (分类：food/transport/shopping/other)
        - note: str (备注说明)
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        prompt = f"""用户想要记录一笔支出，请解析并返回JSON格式。

当前日期：{current_date} {current_time}
用户输入：{user_text}

请从用户输入中提取：
1. 金额（数字，单位元）
2. 消费分类（只能选以下之一：food餐饮、transport交通、shopping购物、other其他）
3. 备注说明（简短描述这笔支出是什么，去掉金额信息）

返回JSON格式（只返回JSON，不要其他内容）：
{{
    "amount": 金额数字，如15.5,
    "category": "food/transport/shopping/other之一",
    "note": "简短备注，如'吃面'、'打车'"
}}

规则：
- 金额必须提取或根据描述合理推断（如"吃了碗面"可以推断10-30元）
- 分类推断：吃饭→food，打车/公交/地铁→transport，买东西/网购→shopping，其他→other
- 备注只保留核心内容，去掉金额
- 如果用户没明确金额，给一个合理推断值"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个记账助手，帮助用户将口语化的消费描述转换为结构化的记账数据。"},
            {"role": "user", "content": prompt}
        ], temperature=0.3)
        
        if not response:
            return None
        
        # Extract JSON from response
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
