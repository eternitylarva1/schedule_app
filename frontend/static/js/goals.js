/**
 * Schedule App - Goals Module (Compositor)
 * Re-exports from sub-modules: goal-core, goal-list, goal-ai, goal-timeline, goal-calendar
 */

(function(global) {
    'use strict';

    // Re-export from sub-modules
    const core = global.ScheduleAppGoalCore || {};
    const list = global.ScheduleAppGoalList || {};
    const ai = global.ScheduleAppGoalAI || {};
    const timeline = global.ScheduleAppGoalTimeline || {};
    const calendar = global.ScheduleAppGoalCalendar || {};

    global.ScheduleAppGoals = {
        ...core,
        ...list,
        ...ai,
        ...timeline,
        ...calendar,
    };

    // Re-export updateBreakdownItem as global (used by inline onchange handlers)
    global.updateBreakdownItem = ai.updateBreakdownItem;
})(window);
