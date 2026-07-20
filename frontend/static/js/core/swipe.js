(function(global){
    'use strict';
    const state = (global.ScheduleAppCore && global.ScheduleAppCore.state) || {};

    function closeAllOpenSwipeItems(exceptEl = null) {
        document.querySelectorAll('.swipe-item.swipe-open').forEach((openEl) => {
            if (exceptEl && openEl === exceptEl) return;
            const openContent = openEl.querySelector('.swipe-content');
            if (openContent) {
                openContent.style.transform = 'translateX(0px)';
            }
            openEl.classList.remove('swipe-open', 'swipe-open-left', 'swipe-open-right');
        });
    }

    function bindSwipeItem(itemEl) {
        if (!itemEl || itemEl.dataset.swipeBound === '1') return;
        itemEl.dataset.swipeBound = '1';

        const contentEl = itemEl.querySelector('.swipe-content');
        if (!contentEl) return;

        const actionWidth = 82;
        const openThreshold = 50;
        const axisLockThreshold = 8;

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let baseX = 0;
        let dragging = false;
        let axisLocked = false;
        let horizontalDrag = false;

        const setTranslate = (x) => {
            contentEl.style.transform = `translateX(${x}px)`;
        };

        const openTo = (x) => {
            const finalX = Math.max(-actionWidth, Math.min(actionWidth, x));
            setTranslate(finalX);
            itemEl.classList.toggle('swipe-open', finalX !== 0);
            itemEl.classList.toggle('swipe-open-left', finalX > 0);
            itemEl.classList.toggle('swipe-open-right', finalX < 0);
        };

        const closeSelf = () => {
            openTo(0);
        };

        const onStart = (clientX, clientY) => {
            closeAllOpenSwipeItems(itemEl);
            dragging = true;
            startX = clientX;
            startY = clientY;
            axisLocked = false;
            horizontalDrag = false;
            baseX = itemEl.classList.contains('swipe-open-left')
                ? actionWidth
                : itemEl.classList.contains('swipe-open-right')
                    ? -actionWidth
                    : 0;
            currentX = baseX;
            contentEl.classList.add('dragging');
        };

        const onMove = (clientX, clientY, originalEvent = null) => {
            if (!dragging) return;

            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            if (!axisLocked && (Math.abs(deltaX) > axisLockThreshold || Math.abs(deltaY) > axisLockThreshold)) {
                axisLocked = true;
                horizontalDrag = Math.abs(deltaX) >= Math.abs(deltaY);
                // Mark as dragged so click doesn't fire after swipe
                if (horizontalDrag) {
                    itemEl.classList.add('swipe-just-dragged');
                }
            }

            if (!horizontalDrag) return;

            if (originalEvent && typeof originalEvent.preventDefault === 'function' && originalEvent.cancelable) {
                originalEvent.preventDefault();
            }

            currentX = Math.max(-actionWidth, Math.min(actionWidth, baseX + deltaX));
            setTranslate(currentX);
        };

        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            contentEl.classList.remove('dragging');

            if (!horizontalDrag) {
                setTranslate(baseX);
                return;
            }

            if (currentX > openThreshold) {
                openTo(actionWidth);
            } else if (currentX < -openThreshold) {
                openTo(-actionWidth);
            } else {
                closeSelf();
            }

            axisLocked = false;
            horizontalDrag = false;

            // Remove swipe-just-dragged after a short delay to prevent click
            setTimeout(() => {
                itemEl.classList.remove('swipe-just-dragged');
            }, 50);
        };

        contentEl.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        contentEl.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
        contentEl.addEventListener('touchend', onEnd, { passive: true });
        contentEl.addEventListener('touchcancel', onEnd, { passive: true });

        contentEl.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
        contentEl.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY, e));
        contentEl.addEventListener('mouseup', onEnd);
        contentEl.addEventListener('mouseleave', onEnd);

        if (!state.notepadSwipeGlobalBound) {
            document.addEventListener('click', (e) => {
                if (!(e.target instanceof Element)) return;
                if (e.target.closest('.swipe-item')) return;
                closeAllOpenSwipeItems();
            }, true);
            state.notepadSwipeGlobalBound = true;
        }
    }

    global.ScheduleAppCore = {
        ...(global.ScheduleAppCore || {}),
        closeAllOpenSwipeItems,
        bindSwipeItem,
    };
})(window);
