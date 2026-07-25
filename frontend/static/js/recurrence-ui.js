(function () {
    'use strict';

    // Internal helper – not exported
    function _recurrenceToSelectValue(rec) {
        if (!rec || rec === 'none') return 'none';
        if (['daily', 'workdays', 'weekly', 'monthly'].includes(rec)) return rec;
        if (rec.startsWith('{')) {
            try {
                const rule = JSON.parse(rec);
                if (rule.freq === 'weekly' && Array.isArray(rule.days)) return 'custom-weekly';
                if (rule.freq === 'monthly' && rule.nth && rule.day !== undefined) return 'custom-monthly-nth';
                if (rule.freq === 'monthly' && Array.isArray(rule.days)) return 'custom-monthly-day';
            } catch (e) { /* ignore */ }
        }
        return 'none';
    }

    function applyRecurrenceUI(rec) {
        const elements = (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
        const sel = elements.recurrenceSelect;
        const panelWeekly = document.getElementById('recurrenceCustomWeekly');
        const panelMonthlyNth = document.getElementById('recurrenceCustomMonthlyNth');
        const panelMonthlyDay = document.getElementById('recurrenceCustomMonthlyDay');
        if (!sel) return;

        const value = _recurrenceToSelectValue(rec);
        sel.value = value;
        if (panelWeekly) panelWeekly.style.display = 'none';
        if (panelMonthlyNth) panelMonthlyNth.style.display = 'none';
        if (panelMonthlyDay) panelMonthlyDay.style.display = 'none';

        document.querySelectorAll('#weekdayCheckboxes input').forEach(cb => cb.checked = false);
        const monthlyDaysInput = document.getElementById('monthlyDaysInput');
        if (monthlyDaysInput) monthlyDaysInput.value = '';

        if (value === 'custom-weekly') {
            if (panelWeekly) panelWeekly.style.display = 'block';
            if (rec && rec.startsWith('{')) {
                try {
                    const rule = JSON.parse(rec);
                    (rule.days || []).forEach(d => {
                        const cb = document.querySelector(`#weekdayCheckboxes input[data-day="${d}"]`);
                        if (cb) cb.checked = true;
                    });
                } catch (e) {}
            }
        } else if (value === 'custom-monthly-nth') {
            if (panelMonthlyNth) panelMonthlyNth.style.display = 'block';
            if (rec && rec.startsWith('{')) {
                try {
                    const rule = JSON.parse(rec);
                    const nthSel = document.getElementById('monthlyNthSelect');
                    const daySel = document.getElementById('monthlyNthDaySelect');
                    if (nthSel) nthSel.value = String(rule.nth || 1);
                    if (daySel) daySel.value = String(rule.day || 0);
                } catch (e) {}
            }
        } else if (value === 'custom-monthly-day') {
            if (panelMonthlyDay) panelMonthlyDay.style.display = 'block';
            if (rec && rec.startsWith('{')) {
                try {
                    const rule = JSON.parse(rec);
                    const inp = document.getElementById('monthlyDaysInput');
                    if (inp && Array.isArray(rule.days)) inp.value = rule.days.join(',');
                } catch (e) {}
            }
        }
    }

    function collectRecurrenceFromUI() {
        const elements = (window.ScheduleAppCore && window.ScheduleAppCore.elements) || {};
        const sel = elements.recurrenceSelect;
        if (!sel) return 'none';
        const value = sel.value;
        if (value === 'none' || value === 'daily' || value === 'workdays' || value === 'weekly' || value === 'monthly') {
            return value;
        }
        if (value === 'custom-weekly') {
            const days = [];
            document.querySelectorAll('#weekdayCheckboxes input:checked').forEach(cb => {
                days.push(parseInt(cb.dataset.day, 10));
            });
            if (days.length === 0) return 'none';
            return JSON.stringify({ freq: 'weekly', days: days.sort() });
        }
        if (value === 'custom-monthly-nth') {
            const nth = parseInt(document.getElementById('monthlyNthSelect').value, 10);
            const day = parseInt(document.getElementById('monthlyNthDaySelect').value, 10);
            return JSON.stringify({ freq: 'monthly', nth, day });
        }
        if (value === 'custom-monthly-day') {
            const raw = (document.getElementById('monthlyDaysInput').value || '').trim();
            if (!raw) return 'none';
            const days = raw.split(/[,\s]+/)
                .map(s => parseInt(s, 10))
                .filter(n => Number.isInteger(n) && n >= 1 && n <= 31);
            if (days.length === 0) return 'none';
            return JSON.stringify({ freq: 'monthly', days: days.sort((a, b) => a - b) });
        }
        return 'none';
    }

    function formatRecurrenceDisplay(rec) {
        if (!rec || rec === 'none') return '不重复';
        if (rec === 'daily') return '每天';
        if (rec === 'workdays') return '每个工作日（一/二/三/四/五）';
        if (rec === 'weekly') return '每周（与开始日同一天）';
        if (rec === 'monthly') return '每月（同一天）';
        if (rec.startsWith('{')) {
            try {
                const rule = JSON.parse(rec);
                const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
                if (rule.freq === 'weekly' && Array.isArray(rule.days)) {
                    return '每周 ' + rule.days.map(d => '周' + dayNames[d]).join(' ');
                }
                if (rule.freq === 'monthly' && rule.nth && rule.day !== undefined) {
                    const nthLabels = { 1: '第1个', 2: '第2个', 3: '第3个', 4: '第4个', 5: '最后一个' };
                    return '每月 ' + (nthLabels[rule.nth] || `第${rule.nth}个`) + ' 周' + dayNames[rule.day];
                }
                if (rule.freq === 'monthly' && Array.isArray(rule.days)) {
                    return '每月 ' + rule.days.join('、') + ' 号';
                }
            } catch (e) { /* ignore */ }
        }
        return rec;
    }

    window.ScheduleAppRecurrenceUI = {
        applyRecurrenceUI,
        collectRecurrenceFromUI,
        formatRecurrenceDisplay,
    };
})();
