"""LLM service for natural language processing."""
import aiohttp
import asyncio
import json
import os
from typing import Optional, Dict, Any, List


class LLMService:
    """OpenAI-compatible LLM service."""
    
    def __init__(self):
        # 支持环境变量配置或硬编码默认值
        self.api_base = os.getenv("LLM_API_BASE", "https://open.cherryin.net/v1")
        self.api_key = os.getenv("LLM_API_KEY", "sk-nzCBqwmTVmDj137YyfMVKp1xAAVv0Pc2YrXHpHqwILKpDEEw")
        self.model = os.getenv("LLM_MODEL", "minimax/minimax-m2.5-highspeed")
        self._db_path = None  # Will be set when app initializes
    
    def set_db_path(self, db_path: str):
        """Set database path for runtime configuration."""
        self._db_path = db_path
    
    async def _load_settings_from_db(self):
        """Load LLM settings from ai_providers table - use active provider."""
        if not self._db_path:
            return
        
        try:
            import aiosqlite
            async with aiosqlite.connect(self._db_path) as conn:
                conn.row_factory = aiosqlite.Row
                # First check if there are any ai_providers configured
                async with conn.execute("SELECT COUNT(*) as cnt FROM ai_providers") as cursor:
                    row = await cursor.fetchone()
                    if row is None or row["cnt"] == 0:
                        # No providers configured, use environment defaults
                        return
                
                # Get active provider
                async with conn.execute("SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1") as cursor:
                    provider = await cursor.fetchone()
                    if provider:
                        self.api_base = provider["api_base"]
                        self.model = provider["model"]
                        self.api_key = provider["api_key"]
                    else:
                        # No active provider, use first provider as fallback
                        async with conn.execute("SELECT * FROM ai_providers LIMIT 1") as cursor:
                            provider = await cursor.fetchone()
                            if provider:
                                self.api_base = provider["api_base"]
                                self.model = provider["model"]
                                self.api_key = provider["api_key"]
        except Exception as e:
            print(f"Failed to load LLM settings from DB: {e}")
    
    async def chat(self, messages: list[dict[str, Any]], temperature: float = 0.7) -> Optional[str]:
        """Send chat request to LLM API."""
        # Load settings from database at runtime (allows user to change settings without restart)
        await self._load_settings_from_db()
        
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

请先纠正用户输入中的错别字，特别是：
- "考试"或"考式"或"拷试"→"小时"（表示时间长度）
- 其他常见输入法错字

请分析用户输入，如果包含多个时间段的安排（如"先去...然后...接着..."），请解析出多个日程。
如果只有单一安排，就返回一个日程。

返回JSON数组格式（只返回JSON，不要其他内容）：
{{
    "events": [
{{
    "title": "日程标题（提取核心任务，去除时间描述）",
    "start_time": "ISO格式开始时间，如2026-04-01T15:00:00；如果时间不明确可返回null",
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
- "X月X号前/之前/以前" 本质是deadline，除非用户给了明确时刻，否则start_time返回null
- 如果用户没有给出明确时间（如"找时间"、"尽快"、"这两天安排"），start_time返回null，不要编造具体时间
- 绝对日期约束（如"4月17号前"）绝对不能返回今天时间
- 只提取任务名称，不要时间描述在标题里
- category推断：工作→work，生活→life，学习→study，运动健康→health
- 优先根据语义推断时间：看到"吃早餐"、"起床"等词应推断为早晨的时间段
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
## 当前时间
{current_date} {current_time}

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

请先判断信息是否足够给每个子任务分配“具体日期+开始时间+结束时间”。
如果不够（例如缺截止日、每日可投入时段、是否固定空档），先提出1-2个关键问题。
如果足够，直接返回可导入日程的子任务JSON。

回复格式：
- 如果需要提问：直接问问题，不要其他内容
- 如果直接拆解：返回JSON格式的子任务列表"""
        else:
            # User is responding to a question
            user_message = f"""用户的初步目标：{goal_content}

用户回答：{user_input}

请根据用户回答继续判断：
1) 是否已经足够进行“按天+按时段”的任务分配
2) 如果还不够，只再问1个关键问题
3) 如果足够，返回可直接导入日程的子任务JSON

回复格式：
- 如果继续提问：直接问问题
- 如果信息足够：返回JSON格式的子任务列表

子任务JSON格式：
{{
    "subtasks": [
        {{
            "title": "子任务名称",
            "date": "YYYY-MM-DD",
            "start_time": "HH:MM",
            "end_time": "HH:MM",
            "duration_minutes": 90,
            "duration_hint": "预计时长提示，如'1.5小时'"
        }},
        ...
    ],
    "summary": "整体计划总结"
}}
"""
        
        system_prompt = """你是一个任务规划助手，通过友好对话帮助用户拆解目标并分配具体时间。

你的工作方式：
1. 先通过1-2个关键问题了解用户的目标背景
2. 根据回答继续提问或生成拆解方案
3. 拆解时要考虑用户的时间安排，避免与已有日程冲突
4. 目标是输出可直接导入日程的时间化子任务（不是只有标题）

提问原则：
- 只问最关键的问题，不要一次性问太多
- 问题要具体、有意义
- 用户背景和日程会作为参考，但要针对性提问
- 若无法确定日期/时段，必须先问清，不要硬编同一天时间

拆解原则：
- 子任务要具体可执行
- 子任务数量控制在3-8个
- 默认输出字段必须包含：title/date/start_time/end_time/duration_minutes/duration_hint
- date 使用 YYYY-MM-DD；start_time/end_time 使用 HH:MM（24小时制）
- 时间分配要跨天合理分布，不要全部同一天
- 子任务之间时间不得重叠
- 尽量避开“本周日程”里已存在的时间段
- 若用户给了可投入时段（如工作日20:00-23:00、周末14:00-20:00），必须遵循"""

        response = await self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
            {"role": "user", "content": user_message}
        ], temperature=0.7)
        
        if not response:
            return None
        
        # Check if response is a question or subtasks
        response = response.strip()

        def _normalize_subtasks(raw_subtasks):
            normalized_local = []
            for st in raw_subtasks or []:
                if not isinstance(st, dict):
                    continue
                normalized_local.append({
                    "title": (st.get("title") or "").strip(),
                    "date": (st.get("date") or "").strip(),
                    "start_time": (st.get("start_time") or "").strip(),
                    "end_time": (st.get("end_time") or "").strip(),
                    "duration_minutes": st.get("duration_minutes"),
                    "duration_hint": (st.get("duration_hint") or "").strip(),
                })
            return [x for x in normalized_local if x.get("title")][:8]
        
        # If response contains JSON, it's subtasks
        if '{' in response and 'subtasks' in response.lower():
            try:
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = response[json_start:json_end]
                    result = json.loads(json_str)
                    subtasks = result.get("subtasks", []) if isinstance(result, dict) else []
                    normalized = _normalize_subtasks(subtasks)

                    def _has_complete_time_fields(items):
                        return len(items) > 0 and all(i.get("date") and i.get("start_time") and i.get("end_time") for i in items)

                    if normalized and not _has_complete_time_fields(normalized):
                        # Second-pass scheduling: force concrete date/time assignment
                        scheduling_prompt = f"""请将下列子任务补全为可直接导入日程的时间化任务。

当前时间：{current_date} {current_time}
目标：{goal_content}
用户最新补充：{user_input if user_input else '（无）'}
历史上下文：
{history_context if history_context else '（无）'}

待补全子任务：
{json.dumps(normalized, ensure_ascii=False)}

输出严格JSON：
{{
  "subtasks": [
    {{
      "title": "...",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "duration_minutes": 90,
      "duration_hint": "1.5小时"
    }}
  ],
  "summary": "..."
}}

规则：
1) 必须给每个任务分配具体日期和时间段。
2) 时间要跨天合理分布，不要全部同一天。
3) 子任务之间时间不得重叠，且尽量避开本周已存在日程。
3) 若用户给了可投入时段，必须优先遵循。
4) 只返回JSON，不要解释。"""

                        scheduled_response = await self.chat([
                            {"role": "system", "content": "你是任务排程助手，只返回严格JSON。"},
                            {"role": "user", "content": scheduling_prompt}
                        ], temperature=0.3)

                        if scheduled_response:
                            try:
                                s_start = scheduled_response.find('{')
                                s_end = scheduled_response.rfind('}') + 1
                                if s_start >= 0 and s_end > s_start:
                                    scheduled_json = json.loads(scheduled_response[s_start:s_end])
                                    normalized2 = _normalize_subtasks(scheduled_json.get("subtasks", []))
                                    if _has_complete_time_fields(normalized2):
                                        normalized = normalized2
                            except json.JSONDecodeError:
                                pass

                    if normalized and not _has_complete_time_fields(normalized):
                        return {
                            "type": "question",
                            "message": "为了给你分配到具体哪一天和几点，我还需要确认：你的截止日期与每天可投入时段分别是什么？（例如：4月20日前，工作日20:00-23:00，周末14:00-20:00）",
                            "subtasks": []
                        }

                    return {
                        "type": "subtasks",
                        "message": result.get("summary", "任务拆解完成"),
                        "subtasks": normalized
                    }
            except json.JSONDecodeError:
                pass
        
        # Otherwise it's a question
        return {
            "type": "question",
            "message": response,
            "subtasks": []
        }

    async def parse_expense(self, user_text: str, budgets: Optional[List[Dict[str, Any]]] = None, 
                            auto_assign_budget: bool = False) -> Optional[List[Dict[str, Any]]]:
        """Parse natural language expense(s) into structured data.
        
        Args:
            user_text: The user's natural language input
            budgets: List of existing budgets with id, name, color
            auto_assign_budget: Whether to auto-assign budget based on content
            
        Returns list of dicts, each with:
        - amount: float (金额)
        - category: str (分类：food/transport/shopping/other)
        - note: str (备注说明)
        - budget_id: int or None (预算ID，仅在明确提及或高置信度匹配时返回)
        
        If user mentions multiple expenses (e.g., "买书50，吃饭20")，
        returns multiple items in the list.
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")
        
        budgets_context = ""
        if budgets:
            budget_list = "\n".join([f"- {b['name']} (ID:{b['id']})" for b in budgets])
            budgets_context = f"""
现有预算列表：
{budget_list}

规则：
- 如果用户明确提到某个预算名称（如'加入学习预算'、'从学习预算支出'），必须将该预算ID填入budget_id
- 如果用户没有明确提到预算名称，且auto_assign_budget为false，则budget_id填null
- 如果用户没有明确提到预算名称，但auto_assign_budget为true，只有当支出内容与某个预算【高度相关】时才填入该预算ID（【高度相关】意味着支出内容几乎是必然属于该预算，例如'买书'对于'学习'预算）
- 如果没有高度相关的预算，budget_id填null
- 判断高度相关时要严格，避免误判"""
        else:
            budgets_context = "\n\n（暂无预算列表，budget_id固定为null）"
        
        prompt = f"""用户想要记录支出，请解析并返回JSON格式。支持同时记录多笔支出，用逗号、顿号、或"和"连接多个支出描述。

当前日期：{current_date} {current_time}
用户输入：{user_text}
{budgets_context}

请从用户输入中提取所有支出：
- 每笔支出包含：金额（数字，单位元）、消费分类（food餐饮/transport交通/shopping购物/other其他）、备注说明
- 如果用户一次说了多笔支出（如"买书50，吃饭20，喝奶茶15"），返回多笔
- 如果只有一笔支出，也返回单元素列表

返回JSON格式（只返回JSON，不要其他内容）：
{{
    "expenses": [
        {{
            "amount": 金额数字，如15.5,
            "category": "food/transport/shopping/other之一",
            "note": "简短备注，如'吃面'、'打车'",
            "budget_id": 预算ID数字或null
        }},
        ... 更多支出
    ]
}}

规则：
- 金额必须提取或根据描述合理推断（如"吃了碗面"可以推断10-30元）
- 分类推断：吃饭→food，打车/公交/地铁→transport，买东西/网购→shopping，其他→other
- 备注只保留核心内容，去掉金额
- 如果用户没明确金额，给一个合理推断值
- 如果描述中包含多个独立支出项，必须全部解析出来
- 每笔支出单独一个对象，不要合并"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个记账助手，帮助用户将口语化的消费描述转换为结构化的记账数据。支持批量记录多笔支出。"},
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
                result = json.loads(json_str)
                if isinstance(result, dict) and "expenses" in result:
                    return result["expenses"]
                elif isinstance(result, list):
                    return result
        except json.JSONDecodeError:
            pass
        
        return None

    async def chat_about_note(
        self,
        note_content: str,
        user_message: str,
        selected_text: str = "",
        conversation_history: str = ""
    ) -> Optional[str]:
        """Chat about a note with full context.
        
        Args:
            note_content: The full note text as context
            user_message: The user's question
            selected_text: Optional text the user selected in the note
            conversation_history: Previous conversation context
        
        Returns:
            AI's response text or None if failed
        """
        # Build context section
        context = f"""
## 笔记全文
{note_content if note_content else "（笔记为空）"}
"""
        
        if selected_text:
            context += f"""
## 用户选中的文本
{selected_text}
"""
        
        if conversation_history:
            context += f"""
## 对话历史
{conversation_history}
"""
        
        prompt = f"""{context}

用户的问题：{user_message}

请根据笔记内容回答用户的问题。如果用户选中了特定文本，重点针对该文本回答。
回答要简洁、有帮助。如果笔记内容与问题无关，请如实说明。"""
        
        response = await self.chat([
            {"role": "system", "content": "你是一个笔记助手，帮助用户理解和整理笔记内容。回答要简洁、有条理。"},
            {"role": "user", "content": prompt}
        ], temperature=0.7)
        
        return response

    async def process_unified_command(self, user_text: str) -> Optional[Dict[str, Any]]:
        """Parse unified natural-language commands for schedule/todo operations.

        Returns:
        {
          "operations": [
            {"action":"create","title":"...","start_time":"...|null","duration_minutes":30,"category_id":"work"},
            {"action":"delete","scope":"all|date","date":"YYYY-MM-DD|null"},
            {"action":"complete","scope":"all|date","date":"YYYY-MM-DD|null"},
            {"action":"uncomplete","scope":"all|date","date":"YYYY-MM-DD|null"}
          ],
          "summary": "..."
        }
        """
        from datetime import datetime
        now = datetime.now()
        current_date = now.strftime("%Y年%m月%d日")
        current_time = now.strftime("%H:%M")

        prompt = f"""用户输入了一条自然语言指令，请解析为可执行操作列表并返回JSON。

当前日期：{current_date} {current_time}
用户输入：{user_text}

你必须在以下 action 中选择：
- create: 创建日程/待办
- delete: 删除日程/待办（批量或按日期）
- complete: 完成日程/待办（批量或按日期）
- uncomplete: 撤销完成（批量或按日期）

返回格式（只返回JSON，不要任何解释文字）：
{{
  "operations": [
    {{
      "action": "create|delete|complete|uncomplete",
      "title": "当action=create时必填，否则为null",
      "start_time": "ISO时间或null（仅create使用）",
      "duration_minutes": 30,
      "category_id": "work/life/study/health（仅create使用）",
      "scope": "all|date（delete/complete/uncomplete使用）",
      "date": "YYYY-MM-DD或null（scope=date时必填）"
    }}
  ],
  "summary": "一句话总结"
}}

规则：
1) 支持一条输入中的多操作（按输入顺序输出）。
2) 对“删除所有4月5号的代办”这类，输出 action=delete, scope=date, date=对应日期。
3) 对“完成所有代办”这类，输出 action=complete, scope=all。
4) 对“撤销所有完成”这类，输出 action=uncomplete, scope=all。
5) create时：
   - 若用户给出明确时间则填 start_time
   - 若无明确时间则 start_time = null
   - “X月X号前/之前/以前” 视为截止约束，不给明确时刻时 start_time = null
6) 不能确定时，宁可返回 start_time=null，也不要编造今天时间。
"""

        response = await self.chat([
            {"role": "system", "content": "你是一个任务执行解析器，只返回严格JSON。"},
            {"role": "user", "content": prompt}
        ], temperature=0.2)

        if not response:
            return None

        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                parsed = json.loads(json_str)
                operations = parsed.get("operations", []) if isinstance(parsed, dict) else []
                if not isinstance(operations, list):
                    operations = []
                return {
                    "operations": operations,
                    "summary": parsed.get("summary", "") if isinstance(parsed, dict) else "",
                }
        except json.JSONDecodeError:
            pass

        return None


# Global instance
llm_service = LLMService()
