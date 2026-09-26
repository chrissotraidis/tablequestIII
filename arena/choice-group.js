// Replace a native <select> with an in-theme row of choices. The select stays
// in the DOM as the source of truth (existing change handlers, disabled and
// hidden states keep working); the buttons only mirror and set its value.
export function choiceGroup(select, { className = '', decorate = null } = {}) {
    const group = document.createElement('div');
    group.className = `choice-group ${className}`.trim();
    group.setAttribute('role', 'radiogroup');
    const label = select.getAttribute('aria-label') || select.closest('label')?.childNodes[0]?.textContent?.trim();
    if (label) group.setAttribute('aria-label', label);
    const buttons = [...select.options].map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = option.value;
        button.setAttribute('role', 'radio');
        const text = document.createElement('span');
        text.className = 'choice-label';
        text.textContent = option.textContent;
        button.append(text);
        decorate?.(button, option.value);
        button.addEventListener('click', () => {
            if (select.disabled || select.value === option.value) return;
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            sync();
        });
        return button;
    });
    group.append(...buttons);
    group.addEventListener('keydown', (event) => {
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!step) return;
        event.preventDefault(); event.stopPropagation();
        const index = buttons.findIndex((button) => button.dataset.value === select.value);
        const next = buttons[(index + step + buttons.length) % buttons.length];
        next.click(); next.focus();
    });
    function sync() {
        for (const button of buttons) {
            const on = button.dataset.value === select.value;
            button.setAttribute('aria-checked', String(on));
            button.tabIndex = on ? 0 : -1;
            button.disabled = select.disabled;
        }
        group.classList.toggle('hidden', select.classList.contains('hidden'));
    }
    select.classList.add('choice-source');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.after(group);
    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled', 'class'] });
    sync();
    return sync;
}
