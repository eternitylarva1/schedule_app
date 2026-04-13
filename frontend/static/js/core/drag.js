/**
 * Extracted drag/resize logic (no behavior change).
 */
(function(global){
    'use strict';
    const state = global.ScheduleAppCore.state;
    const elements = global.ScheduleAppCore.elements;
    const { isSameDay, getEventTop, getEventHeight, formatTimeRange, apiCall, showToast } = global.ScheduleAppCore;

    function handleEventDragStart(e, event, type) {
        // Stop event from bubbling to touch handlers
        e.stopPropagation();
        e.preventDefault();
        
        state.dragState = {
            event: event,
            type: type,
            originalStart: event.start_time ? new Date(event.start_time) : null,
            originalEnd: event.end_time ? new Date(event.end_time) : null,
            startY: e.clientY || e.touches[0].clientY
        };
        
        document.addEventListener('mousemove', handleEventDragMove);
        document.addEventListener('mouseup', handleEventDragEnd);
        document.addEventListener('touchmove', handleEventDragMove, { passive: false });
        document.addEventListener('touchend', handleEventDragEnd);
    }



    function handleEventDragMove(e) {
        if (!state.dragState.event) return;
        
        // Prevent default to stop page scroll
        e.preventDefault();
        
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (clientY === undefined) return;
        
        const deltaY = clientY - state.dragState.startY;
        const deltaMinutes = Math.round(deltaY); // 1px = 1 minute
        
        const event = state.dragState.event;
        const originalStart = state.dragState.originalStart;
        const originalEnd = state.dragState.originalEnd;
        
        // Get all events on the same day for boundary detection
        const dayEvents = state.events.filter(ev => {
            if (!ev.start_time || ev.id === event.id) return false;
            return isSameDay(ev.start_time, event.start_time);
        });
        
        if (state.dragState.type === 'start' && originalStart) {
            // Adjust start time
            let newStart = new Date(originalStart.getTime() + deltaMinutes * 60 * 1000);
            
            // Check boundary: don't go past end time
            if (originalEnd && newStart >= originalEnd) {
                newStart = new Date(originalEnd.getTime() - 15 * 60 * 1000);
            }
            
            // Check boundary: don't overlap with other events
            for (const other of dayEvents) {
                if (!other.end_time) continue;
                const otherEnd = new Date(other.end_time);
                if (newStart >= otherEnd && newStart < originalEnd) {
                    // Snap to end of the previous event
                    newStart = new Date(otherEnd.getTime());
                }
            }
            
            event.start_time = newStart.toISOString();
            event._localModified = true; // Mark as locally modified
        } else if (state.dragState.type === 'end' && originalEnd) {
            // Adjust end time
            let newEnd = new Date(originalEnd.getTime() + deltaMinutes * 60 * 1000);
            
            // Check boundary: don't go before start time
            if (originalStart && newEnd <= originalStart) {
                newEnd = new Date(originalStart.getTime() + 15 * 60 * 1000);
            }
            
            // Check boundary: don't overlap with other events
            for (const other of dayEvents) {
                if (!other.start_time) continue;
                const otherStart = new Date(other.start_time);
                if (newEnd <= otherStart && newEnd > originalEnd) {
                    // Snap to start of the next event
                    newEnd = new Date(otherStart.getTime());
                }
            }
            
            event.end_time = newEnd.toISOString();
            event._localModified = true; // Mark as locally modified
        }
        
        // Update the event element visual
        updateEventElementVisual(event);
    }



    function updateEventElementVisual(event) {
        const eventEl = document.querySelector(`[data-event-id="${event.id}"]`);
        if (!eventEl) return;
        
        eventEl.style.top = `${getEventTop(event)}px`;
        eventEl.style.height = `${getEventHeight(event)}px`;
        
        const timeEl = eventEl.querySelector('.timeline-event-time');
        if (timeEl) {
            timeEl.textContent = formatTimeRange(event);
        }
    }



    async function handleEventDragEnd() {
        if (!state.dragState.event) return;
        
        const event = state.dragState.event;
        
        // Remove listeners first
        document.removeEventListener('mousemove', handleEventDragMove);
        document.removeEventListener('mouseup', handleEventDragEnd);
        document.removeEventListener('touchmove', handleEventDragMove);
        document.removeEventListener('touchend', handleEventDragEnd);
        
        // Call API to update event and wait for result
        await updateEventAPI(event);
        
        // Reset drag state
        state.dragState = {
            event: null,
            type: null,
            originalStart: null,
            originalEnd: null,
            startY: 0
        };
    }



    async function updateEventAPI(event) {
        console.log('updateEventAPI called for event:', event.id, event.start_time, event.end_time);
        try {
            const result = await apiCall(`events/${event.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title: event.title,
                    start_time: event.start_time,
                    end_time: event.end_time,
                    category_id: event.category_id,
                    all_day: event.all_day,
                    recurrence: event.recurrence,
                    reminder_enabled: event.reminder_enabled,
                    reminder_minutes: event.reminder_minutes
                })
            });
            console.log('updateEventAPI result:', result);
            if (result) {
                // Update local event with server response
                event.start_time = result.start_time;
                event.end_time = result.end_time;
            }
            return result;
        } catch (error) {
            console.error('Failed to update event:', error);
            showToast('更新失败');
            return null;
        }
    }

    global.ScheduleAppCore = {
        ...(global.ScheduleAppCore || {}),
        handleEventDragStart,
        handleEventDragMove,
        updateEventElementVisual,
        handleEventDragEnd,
        updateEventAPI,
    };
})(window);
