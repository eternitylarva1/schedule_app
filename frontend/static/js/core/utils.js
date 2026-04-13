/**
 * Extracted utility layer (no behavior change).
 */
(function(global){
    'use strict';
    const state = global.ScheduleAppCore.state;

    function formatDate(date, format = 'full') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        const weekday = d.getDay();
        
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        
        if (format === 'full') {
            return `${year}年${months[month]}${day}日 ${weekdays[weekday]}`;
        } else if (format === 'month-day') {
            return `${months[month]}${day}日`;
        } else if (format === 'weekday') {
            return weekdays[weekday];
        } else if (format === 'short') {
            return `${month + 1}/${day}`;
        }
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }



    function formatDateForApi(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }



    function isSameDay(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        // Normalize to midnight local time to avoid timezone issues
        d1.setHours(0, 0, 0, 0);
        d2.setHours(0, 0, 0, 0);
        return d1.getTime() === d2.getTime();
    }



    function isToday(date) {
        return isSameDay(date, new Date());
    }



    function getWeekDates(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const dates = [];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(d);
            date.setDate(diff + i);
            dates.push(date);
        }
        return dates;
    }



    function getCompactTitle(title, maxChars = 8) {
        const text = String(title || '').trim();
        if (!text) return '';
        if (text.length <= maxChars) return text;
        return `${text.slice(0, maxChars)}…`;
    }



    function getEventTop(event) {
        if (!event.start_time) return 0;
        const start = new Date(event.start_time);
        const hours = start.getHours();
        const minutes = start.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        const pixelsPerMinute = 1; // 60px per hour / 60 minutes = 1px per minute
        return totalMinutes * pixelsPerMinute;
    }



    function getEventHeight(event) {
        if (!event.start_time || !event.end_time) return 30;
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const durationMinutes = (end - start) / (1000 * 60);
        return Math.max(30, durationMinutes);
    }



    function getCategoryColor(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category ? category.color : '#4285F4';
    }



    function getCategoryName(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        return category ? category.name : categoryId;
    }



    function formatTimeRange(event) {
        if (!event.start_time) return '待定';
        const start = new Date(event.start_time);
        const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        
        if (!event.end_time) return startTime;
        const end = new Date(event.end_time);
        const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
        
        return `${startTime} - ${endTime}`;
    }



    function horizonLabel(horizon) {
        if (horizon === 'semester') return '学期目标';
        if (horizon === 'long') return '长期目标';
        return '短期目标';
    }


    function formatTime(date) {
        const d = new Date(date);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }



    function toLocalDatetime(date) {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    }

    global.ScheduleAppCore = {
        ...(global.ScheduleAppCore || {}),
        formatDate,
        formatDateForApi,
        isSameDay,
        isToday,
        getWeekDates,
        getCompactTitle,
        getEventTop,
        getEventHeight,
        getCategoryColor,
        getCategoryName,
        formatTimeRange,
        horizonLabel,
        formatTime,
        toLocalDatetime,
    };
})(window);
