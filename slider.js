
/* Sarupya Ojha - CSE 230 Image Slider Assignment */

const ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg>',
};

/** Small helper: create an element with a class and attributes. */
const make = (tag, className, attrs = {}) => {
    const el = document.createElement(tag);
    el.className = className;
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
};

class Carousel {
    constructor(target, options = {}) {
        const root = typeof target === 'string' ? document.querySelector(target) : target;
        if (!root) throw new Error(`Carousel: "${target}" was not found.`);

        this.root = root;
        this.windowEl = root.querySelector('.carousel__window');
        this.rail = root.querySelector('.carousel__rail');
        this.items = Array.from(this.rail.children);
        this.total = this.items.length;

        // Respect users who ask for less motion
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.speed = reduceMotion ? 0 : (options.speed ?? 600);
        this.autoplay = reduceMotion ? 0 : (options.autoplay ?? 0);
        this.swipeThreshold = options.swipeThreshold ?? 40;

        this.current = 0;        // index of the slide on screen (or arriving)
        this.busy = false;       // true while a slide animation is running
        this.settleTimer = null;
        this.autoplayTimer = null;

        if (this.total < 2) return; // nothing to slide between

        root.style.setProperty('--speed', `${this.speed}ms`);
        root.tabIndex = 0;
        this.items.forEach((item) => {
            item.querySelectorAll('img').forEach((img) => { img.draggable = false; });
        });

        this.buildControls();
        this.bindEvents();
        this.paint();
        this.startAutoplay();
    }

    /* ---------- Setup ---------- */

    buildControls() {
        this.prevBtn = make('button', 'carousel__btn carousel__btn--prev', {
            type: 'button', 'aria-label': 'Previous slide',
        });
        this.nextBtn = make('button', 'carousel__btn carousel__btn--next', {
            type: 'button', 'aria-label': 'Next slide',
        });
        this.prevBtn.innerHTML = ICONS.prev;
        this.nextBtn.innerHTML = ICONS.next;

        this.counter = make('span', 'carousel__count', {
            'aria-live': this.autoplay ? 'off' : 'polite',
        });

        this.dotBar = make('div', 'carousel__dots', {
            role: 'group', 'aria-label': 'Choose a slide',
        });
        this.dots = this.items.map((item, i) => {
            const title = item.querySelector('figcaption strong')?.textContent ?? `slide ${i + 1}`;
            const dot = make('button', 'carousel__dot', {
                type: 'button', 'aria-label': `Show slide ${i + 1}: ${title}`,
            });
            dot.dataset.target = i;
            this.dotBar.append(dot);
            return dot;
        });

        this.windowEl.append(this.prevBtn, this.nextBtn, this.counter);
        this.root.append(this.dotBar);
    }

    bindEvents() {
        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());

        // One listener for every dot (event delegation)
        this.dotBar.addEventListener('click', (event) => {
            const dot = event.target.closest('.carousel__dot');
            if (dot) this.goTo(Number(dot.dataset.target));
        });

        this.rail.addEventListener('transitionend', (event) => {
            if (event.target === this.rail && event.propertyName === 'transform') this.settle();
        });

        this.root.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowRight') this.next();
            if (event.key === 'ArrowLeft') this.prev();
        });

        // Swipe / drag
        let startX = null;
        this.windowEl.addEventListener('pointerdown', (event) => { startX = event.clientX; });
        this.windowEl.addEventListener('pointercancel', () => { startX = null; });
        this.windowEl.addEventListener('pointerup', (event) => {
            if (startX === null) return;
            const deltaX = event.clientX - startX;
            startX = null;
            if (Math.abs(deltaX) < this.swipeThreshold) return;
            if (deltaX < 0) this.next(); else this.prev();
        });

        // Pause autoplay while the user is interacting or the tab is hidden
        if (this.autoplay) {
            ['pointerenter', 'focusin'].forEach((name) =>
                this.root.addEventListener(name, () => this.stopAutoplay()));
            ['pointerleave', 'focusout'].forEach((name) =>
                this.root.addEventListener(name, () => this.startAutoplay()));
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.stopAutoplay(); else this.startAutoplay();
            });
        }
    }

    /* ---------- Public API ---------- */

    next() {
        this.go((this.current + 1) % this.total, 1);
    }

    prev() {
        this.go((this.current - 1 + this.total) % this.total, -1);
    }

    /** Slide directly to a slide index (0-based). */
    goTo(index) {
        if (index === this.current) return;
        this.go(index, index > this.current ? 1 : -1);
    }

    /* ---------- Internals ---------- */

    /** Start a slide animation toward `target`. direction: 1 = forward, -1 = back. */
    go(target, direction) {
        if (this.busy) return;       // ignore clicks mid-animation
        this.busy = true;

        const from = this.items[this.current];
        const to = this.items[target];
        this.current = target;
        this.paint();

        if (direction > 0) {
            from.after(to);                // DOM: [from, to, ...]
            this.place(0, false);
            this.place(-100, true);        // slide left by one window width
        } else {
            from.before(to);               // DOM: [to, from, ...]
            this.place(-100, false);       // keep `from` in view
            this.place(0, true);           // slide right to reveal `to`
        }

        // Safety net in case transitionend never fires (e.g. zero duration)
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => this.settle(), this.speed + 120);
    }

    /** Move the rail to a % offset, with or without the CSS transition. */
    place(percent, animate) {
        this.rail.classList.toggle('is-instant', !animate);
        this.rail.style.transform = `translate3d(${percent}%, 0, 0)`;
        void this.rail.offsetWidth;        // flush styles so the change is applied now
    }

    /** After the animation: put the DOM back in ring order starting at the current slide. */
    settle() {
        clearTimeout(this.settleTimer);
        if (!this.busy) return;

        for (let i = 0; i < this.total; i += 1) {
            this.rail.append(this.items[(this.current + i) % this.total]);
        }
        this.place(0, false);
        this.busy = false;
    }

    /** Refresh dots, counter and accessibility state. */
    paint() {
        this.dots.forEach((dot, i) => {
            const active = i === this.current;
            dot.classList.toggle('is-active', active);
            if (active) dot.setAttribute('aria-current', 'true');
            else dot.removeAttribute('aria-current');
        });
        this.items.forEach((item, i) => {
            item.setAttribute('aria-hidden', i === this.current ? 'false' : 'true');
        });
        const pad = (n) => String(n).padStart(2, '0');
        this.counter.textContent = `${pad(this.current + 1)} / ${pad(this.total)}`;
    }

    startAutoplay() {
        if (!this.autoplay) return;
        this.stopAutoplay();
        this.autoplayTimer = setInterval(() => this.next(), this.autoplay);
    }

    stopAutoplay() {
        clearInterval(this.autoplayTimer);
    }
}
