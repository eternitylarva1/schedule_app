/**
 * Schedule App - Calendar Views Module
 * Day/Week/Month calendar rendering extracted from main.js
 */

(function () {
    'use strict';

    function renderTimeline(deps) {
        const {
            state,
            elements,
            isToday,
            isSameDay,
            getEventTop,
            getEventHeight,
            getCategoryColor,
            formatTimeRange,
            escapeHtml,
            showEventDetail,
            markEventDoneQuick,
            handleEventDragStart,
        } = deps;

        const timeline = elements.timeline;
        timeline.innerHTML = '';

        for (let i = 0; i < 24; i++) {
            const hour = document.createElement('div');
            hour.className = 'timeline-hour';
            hour.setAttribute('data-hour', `${String(i).padStart(2, '0')}:00`);
            timeline.appendChild(hour);
        }

        if (isToday(state.currentDate)) {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const currentTop = currentMinutes;

            const timeLine = document.createElement('div');
            timeLine.className = 'current-time-line';
            timeLine.style.top = `${currentTop}px`;
            timeLine.dataset.minutes = currentMinutes;

            const timeLabel = document.createElement('span');
            timeLabel.className = 'current-time-label';
            timeLabel.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            timeLine.appendChild(timeLabel);

            timeline.appendChild(timeLine);
        }

        const dayEvents = state.events.filter((event) => {
            if (!event.start_time) return false;
            return isSameDay(event.start_time, state.currentDate);
        });

        dayEvents.forEach((event) => {
            const eventEl = document.createElement('div');
            eventEl.className = 'timeline-event';
            eventEl.dataset.eventId = event.id;
            eventEl.style.top = `${getEventTop(event)}px`;
            eventEl.style.height = `${getEventHeight(event)}px`;
            eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));

            if (event.status === 'done') {
                eventEl.classList.add('completed');
            }

            let resizeTop;
            let resizeBottom;
            if (state.enableDragResize) {
                resizeTop = document.createElement('div');
                resizeTop.className = 'event-resize-handle resize-top';

                resizeBottom = document.createElement('div');
                resizeBottom.className = 'event-resize-handle resize-bottom';
            }

            eventEl.innerHTML = `
                <div class="timeline-event-title">${escapeHtml(event.title)}</div>
                <div class="timeline-event-time">${formatTimeRange(event)}</div>
                ${event.status !== 'done' ? '<button class="event-quick-complete" title="快速完成">✓</button>' : ''}
            `;

            const quickCompleteBtn = eventEl.querySelector('.event-quick-complete');
            if (quickCompleteBtn) {
                quickCompleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    markEventDoneQuick(event.id);
                });
            }

            if (state.enableDragResize) {
                eventEl.appendChild(resizeTop);
                eventEl.appendChild(resizeBottom);

                resizeTop.addEventListener('mousedown', (e) => handleEventDragStart(e, event, 'start'));
                resizeTop.addEventListener('touchstart', (e) => handleEventDragStart(e, event, 'start'));
                resizeBottom.addEventListener('mousedown', (e) => handleEventDragStart(e, event, 'end'));
                resizeBottom.addEventListener('touchstart', (e) => handleEventDragStart(e, event, 'end'));
            }

            eventEl.addEventListener('click', (e) => {
                if (e.target.closest('.event-resize-handle')) return;
                showEventDetail(event);
            });
            timeline.appendChild(eventEl);
        });
    }

    function updateCurrentTimeLine(deps) {
        const { elements } = deps || window.ScheduleAppCore || {};
        const timeline = elements?.timeline;
        if (!timeline) return;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const currentTop = currentMinutes;

        let timeLine = timeline.querySelector('.current-time-line');
        if (!timeLine) {
            timeLine = document.createElement('div');
            timeLine.className = 'current-time-line';
            timeline.appendChild(timeLine);
        }

        timeLine.style.top = `${currentTop}px`;
        timeLine.dataset.minutes = currentMinutes;

        let timeLabel = timeLine.querySelector('.current-time-label');
        if (!timeLabel) {
            timeLabel = document.createElement('span');
            timeLabel.className = 'current-time-label';
            timeLine.appendChild(timeLabel);
        }
        timeLabel.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function renderAgendaList(mode, deps) {
        const {
            state,
            elements,
            getWeekDates,
            isSameDay,
            formatDate,
            getCategoryColor,
            formatTimeRange,
            escapeHtml,
            showEventDetail,
        } = deps;

        const timeline = elements.timeline;
        timeline.innerHTML = '';

        let dates = [];
        if (mode === 'week') {
            dates = getWeekDates(state.currentDate);
        } else if (mode === 'month') {
            const month = state.currentMonth;
            const year = month.getFullYear();
            const monthIndex = month.getMonth();
            const lastDay = new Date(year, monthIndex + 1, 0);
            const daysInMonth = lastDay.getDate();

            for (let i = 1; i <= daysInMonth; i++) {
                dates.push(new Date(year, monthIndex, i));
            }
        }

        const groupedEvents = {};
        dates.forEach((date) => {
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            groupedEvents[dateKey] = [];
        });

        state.events.forEach((event) => {
            if (!event.start_time) return;
            const eventDate = new Date(event.start_time);
            const dateKey = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
            if (groupedEvents[dateKey]) {
                groupedEvents[dateKey].push(event);
            }
        });

        Object.keys(groupedEvents).forEach((key) => {
            groupedEvents[key].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        });

        const listEl = document.createElement('div');
        listEl.className = 'agenda-list';

        dates.forEach((date) => {
            const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayEvents = groupedEvents[dateKey] || [];

            const sectionEl = document.createElement('div');
            sectionEl.className = 'agenda-day-section';

            const headerEl = document.createElement('div');
            headerEl.className = 'agenda-day-header';

            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            let dateLabel;
            if (isSameDay(date, today)) {
                dateLabel = '今天';
            } else if (isSameDay(date, tomorrow)) {
                dateLabel = '明天';
            } else {
                dateLabel = formatDate(date, 'month-day');
            }

            headerEl.textContent = dateLabel;
            sectionEl.appendChild(headerEl);

            const itemsEl = document.createElement('div');
            itemsEl.className = 'agenda-day-items';

            if (dayEvents.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'agenda-empty';
                emptyEl.textContent = '暂无日程';
                itemsEl.appendChild(emptyEl);
            } else {
                dayEvents.forEach((event) => {
                    const eventEl = document.createElement('div');
                    eventEl.className = 'agenda-event';
                    eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));

                    if (event.status === 'done') {
                        eventEl.classList.add('completed');
                    }

                    eventEl.innerHTML = `
                        <div class="agenda-event-title">${escapeHtml(event.title)}</div>
                        <div class="agenda-event-time">${formatTimeRange(event)}</div>
                    `;

                    eventEl.addEventListener('click', () => {
                        showEventDetail(event);
                    });

                    itemsEl.appendChild(eventEl);
                });
            }

            sectionEl.appendChild(itemsEl);
            listEl.appendChild(sectionEl);
        });

        timeline.appendChild(listEl);
    }

    function renderWeekView(deps) {
        const {
            state,
            elements,
            getWeekDates,
            isToday,
            isSameDay,
            formatDate,
            getCategoryColor,
            getCompactTitle,
            formatTimeRange,
            showEventDetail,
            markEventDoneQuick,
            switchView,
        } = deps;

        const weekDates = getWeekDates(state.currentDate);
        const weekHourHeight = 48;
        const clampMinutes = (minutes) => Math.max(0, Math.min(24 * 60, minutes));
        const weekBody = document.querySelector('.week-body');

        const weekTimeAxis = elements.weekTimeAxis;
        weekTimeAxis.innerHTML = '';

        if (weekBody && weekTimeAxis.parentElement !== weekBody) {
            weekBody.prepend(weekTimeAxis);
        }

        for (let hour = 0; hour <= 24; hour += 2) {
            const label = document.createElement('div');
            label.className = 'week-time-label';
            label.style.top = `${hour * weekHourHeight}px`;
            if (hour === 24) {
                label.classList.add('is-end');
            }
            label.textContent = `${String(hour).padStart(2, '0')}:00`;
            weekTimeAxis.appendChild(label);
        }

        const weekHeader = elements.weekHeader;
        weekHeader.innerHTML = '';

        weekDates.forEach((date) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'week-header-day';
            if (isToday(date)) {
                dayEl.classList.add('today');
            }
            dayEl.innerHTML = `
                <span>${formatDate(date, 'weekday')}</span>
                <span class="week-header-date">${date.getDate()}</span>
            `;
            weekHeader.appendChild(dayEl);
        });

        const weekGrid = elements.weekGrid;
        weekGrid.innerHTML = '';

        weekDates.forEach((date) => {
            const cell = document.createElement('div');
            cell.className = 'week-cell';

            const currentMonth = state.currentDate.getMonth();
            if (date.getMonth() !== currentMonth) {
                cell.classList.add('other-month');
            }

            if (isToday(date)) {
                cell.classList.add('today');
            }

            const dayEvents = state.events.filter((event) => {
                if (!event.start_time) return false;
                return isSameDay(event.start_time, date);
            }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

            const eventsDiv = document.createElement('div');
            eventsDiv.className = 'week-cell-events';

            let prevEventEndMinutes = -1;

            dayEvents.forEach((event) => {
                const start = new Date(event.start_time);
                const fallbackEnd = new Date(start.getTime() + 30 * 60 * 1000);
                const end = event.end_time ? new Date(event.end_time) : fallbackEnd;

                const startMinutes = clampMinutes(start.getHours() * 60 + start.getMinutes());
                let endMinutes = clampMinutes(end.getHours() * 60 + end.getMinutes());
                if (endMinutes <= startMinutes) {
                    endMinutes = clampMinutes(startMinutes + 30);
                }

                const topPx = (startMinutes / 60) * weekHourHeight;
                let heightPx = Math.max(20, ((endMinutes - startMinutes) / 60) * weekHourHeight);

                const gap = 3;
                const isConsecutive = prevEventEndMinutes === startMinutes;

                if (isConsecutive) {
                    heightPx = Math.max(16, heightPx - gap);
                }

                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                eventEl.style.top = `${topPx}px`;
                eventEl.style.height = `${heightPx}px`;

                if (isConsecutive) {
                    eventEl.style.marginTop = `${gap}px`;
                }

                const titleEl = document.createElement('div');
                titleEl.className = 'week-event-title';
                titleEl.textContent = getCompactTitle(event.title, 8);

                const timeEl = document.createElement('div');
                timeEl.className = 'week-event-time';
                timeEl.textContent = formatTimeRange(event);

                eventEl.appendChild(titleEl);
                eventEl.appendChild(timeEl);

                if (event.status !== 'done') {
                    const quickCompleteBtn = document.createElement('button');
                    quickCompleteBtn.className = 'week-event-complete';
                    quickCompleteBtn.textContent = '✓';
                    quickCompleteBtn.title = '快速完成';
                    quickCompleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        markEventDoneQuick(event.id);
                    });
                    eventEl.appendChild(quickCompleteBtn);
                }

                eventEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEventDetail(event);
                });

                eventsDiv.appendChild(eventEl);
                prevEventEndMinutes = endMinutes;
            });

            cell.appendChild(eventsDiv);

            cell.addEventListener('click', (e) => {
                if (e.target.closest('.week-event')) return;
                state.currentDate = new Date(date);
                state.calendarSubview = 'day';
                switchView('day');
            });

            weekGrid.appendChild(cell);
        });

        const oldNowLine = weekBody?.querySelector('.week-now-line');
        if (oldNowLine) oldNowLine.remove();

        const now = new Date();
        const todayIndex = weekDates.findIndex((d) => isSameDay(d, now));
        if (weekBody && todayIndex >= 0) {
            const nowMinutes = clampMinutes(now.getHours() * 60 + now.getMinutes());
            const nowTopPx = (nowMinutes / 60) * weekHourHeight;

            const nowLine = document.createElement('div');
            nowLine.className = 'week-now-line';
            nowLine.style.top = `${nowTopPx}px`;
            nowLine.style.left = `calc(52px + (${todayIndex} * (100% - 52px) / 7))`;
            nowLine.style.width = 'calc((100% - 52px) / 7)';

            const nowLabel = document.createElement('span');
            nowLabel.className = 'week-now-label';
            nowLabel.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            nowLine.appendChild(nowLabel);
            weekBody.appendChild(nowLine);
        }

        scrollWeekViewToCurrentTime(weekDates);
    }

    function scrollWeekViewToCurrentTime(weekDates) {
        const weekBody = document.querySelector('.week-body');
        if (!weekBody) return;

        const weekHourHeight = 48;

        const now = new Date();
        const isCurrentWeek = weekDates.some((d) => {
            const date = new Date(d);
            return date.getFullYear() === now.getFullYear() &&
                date.getMonth() === now.getMonth() &&
                date.getDate() === now.getDate();
        });
        if (!isCurrentWeek) {
            weekBody.scrollTop = 0;
            return;
        }

        const totalMinutes = now.getHours() * 60 + now.getMinutes();
        const targetTop = Math.max(0, Math.floor((totalMinutes / 60) * weekHourHeight) - weekHourHeight * 2);
        weekBody.scrollTop = targetTop;
    }

    function renderMonthView(deps) {
        const {
            state,
            elements,
            isToday,
            isSameDay,
            getCategoryColor,
            getCompactTitle,
            formatTimeRange,
            escapeHtml,
            showEventDetail,
            switchView,
        } = deps;

        const month = state.currentMonth;
        const year = month.getFullYear();
        const monthIndex = month.getMonth();

        const monthHeader = elements.monthHeader;
        monthHeader.innerHTML = '';
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach((day, index) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'month-header-day' + (index === 0 || index === 6 ? ' weekend' : '');
            dayEl.textContent = day;
            monthHeader.appendChild(dayEl);
        });

        const firstDayOfMonth = new Date(year, monthIndex, 1);
        const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay();

        const days = [];

        const prevMonth = new Date(year, monthIndex, 0);
        const daysInPrevMonth = prevMonth.getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, monthIndex - 1, daysInPrevMonth - i),
                isCurrentMonth: false,
            });
        }

        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, monthIndex, i),
                isCurrentMonth: true,
            });
        }

        const remainingDays = 7 - (days.length % 7);
        if (remainingDays < 7) {
            for (let i = 1; i <= remainingDays; i++) {
                days.push({
                    date: new Date(year, monthIndex + 1, i),
                    isCurrentMonth: false,
                });
            }
        }

        const monthGrid = elements.monthGrid;
        monthGrid.innerHTML = '';

        days.forEach((dayInfo) => {
            const cell = document.createElement('div');
            cell.className = 'month-cell';

            if (!dayInfo.isCurrentMonth) {
                cell.classList.add('other-month');
            }

            if (isToday(dayInfo.date)) {
                cell.classList.add('today');
            }

            const dayNumber = document.createElement('div');
            dayNumber.className = 'month-day-number';
            dayNumber.textContent = dayInfo.date.getDate();
            cell.appendChild(dayNumber);

            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'month-events';

            const dayEvents = state.events.filter((event) => {
                if (!event.start_time) return false;
                return isSameDay(event.start_time, dayInfo.date);
            });

            dayEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

            const MAX_EVENTS = 3;
            dayEvents.slice(0, MAX_EVENTS).forEach((event) => {
                const eventEl = document.createElement('div');
                eventEl.className = 'month-event';
                eventEl.style.setProperty('--event-color', getCategoryColor(event.category_id));
                eventEl.innerHTML = `
                    <div class="month-event-title">${escapeHtml(getCompactTitle(event.title, 6))}</div>
                    <div class="month-event-time">${escapeHtml(formatTimeRange(event))}</div>
                `;

                eventEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showEventDetail(event);
                });

                eventsContainer.appendChild(eventEl);
            });

            if (dayEvents.length > MAX_EVENTS) {
                const moreEl = document.createElement('div');
                moreEl.className = 'month-more';
                moreEl.textContent = `+${dayEvents.length - MAX_EVENTS}更多`;
                eventsContainer.appendChild(moreEl);
            }

            cell.appendChild(eventsContainer);

            cell.addEventListener('click', () => {
                state.currentDate = new Date(dayInfo.date);
                state.calendarSubview = 'day';
                switchView('day');
            });

            monthGrid.appendChild(cell);
        });
    }

    window.ScheduleAppCalendarViews = {
        renderTimeline,
        updateCurrentTimeLine,
        renderAgendaList,
        renderWeekView,
        renderMonthView,
    };
})();
