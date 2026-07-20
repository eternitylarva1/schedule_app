/**
 * Schedule App - Goals Module (Compositor)
 * Re-exports from sub-modules: goal-core, goal-list, goal-ai, goal-timeline
 */

(function(global) {
    'use strict';

    // Re-export from sub-modules
    const core = global.ScheduleAppGoalCore || {};
    const list = global.ScheduleAppGoalList || {};
    const ai = global.ScheduleAppGoalAI || {};
    const timeline = global.ScheduleAppGoalTimeline || {};

    global.ScheduleAppGoals = {
        ...core,
        ...list,
        ...ai,
        ...timeline,
    };

    // Re-export updateBreakdownItem as global (used by inline onchange handlers)
    global.updateBreakdownItem = ai.updateBreakdownItem;
})(window);
