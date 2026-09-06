/*
  Top navigation: grouped dropdowns + mobile menu.

  Progressive enhancement. Until this script runs, the stylesheet leaves every dropdown
  expanded in normal flow, so with JS blocked or broken the nav degrades to a plain list
  of every link — nothing becomes unreachable. Adding `js-nav` to <html> is what switches
  the CSS over to collapsed menus, so the collapsed state only ever exists when there is
  script running that can reopen it.

  Interaction contract:
    - click / Enter / Space on a group button toggles it
    - ArrowDown on a closed button opens it and focuses the first item
    - ArrowUp / ArrowDown move within an open menu, Home / End jump to the ends
    - Escape closes and returns focus to the button
    - moving focus or the pointer out of a group closes it
    - on a fine pointer (mouse) hover opens, with aria-expanded kept in sync
    - below the mobile breakpoint the hamburger controls the whole bar and groups
      behave as in-flow accordions
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var nav = document.querySelector('.sitenav');
  if (!nav) return;

  root.classList.add('js-nav');

  var toggle = nav.querySelector('.navtoggle');
  var menu = nav.querySelector('.sitenav-links');
  var groups = Array.prototype.slice.call(nav.querySelectorAll('.navgroup'));

  // Must match the CSS breakpoint below which the nav becomes a hamburger.
  var MOBILE = window.matchMedia('(max-width: 860px)');
  var HOVERABLE = window.matchMedia('(hover: hover) and (pointer: fine)');

  function itemsOf(group) {
    return Array.prototype.slice.call(group.querySelectorAll('.navgroup-menu a'));
  }

  function setOpen(group, open) {
    var btn = group.querySelector('.navgroup-btn');
    group.classList.toggle('is-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeAll(except) {
    groups.forEach(function (g) { if (g !== except) setOpen(g, false); });
  }

  function closeMobileMenu() {
    if (!toggle || !menu) return;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  // --- group buttons -------------------------------------------------------
  groups.forEach(function (group) {
    var btn = group.querySelector('.navgroup-btn');
    if (!btn) return;
    var items = itemsOf(group);

    btn.addEventListener('click', function () {
      // On a mouse, mouseenter has already opened this menu by the time the click
      // lands. Toggling here would close it again, so moving the pointer onto the
      // button and clicking would look like the menu does nothing. The first click
      // after a hover-open therefore just latches it open; the next one closes it.
      if (group.dataset.hoverOpened === '1') {
        delete group.dataset.hoverOpened;
        setOpen(group, true);
        return;
      }
      var open = group.classList.contains('is-open');
      closeAll(group);
      setOpen(group, !open);
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Down') {
        // Stop here: this event would otherwise bubble to the group's own arrow-key
        // handler, which would see focus already on the first item and advance past it.
        e.preventDefault();
        e.stopPropagation();
        closeAll(group);
        setOpen(group, true);
        if (items[0]) items[0].focus();
      } else if (e.key === 'Escape' || e.key === 'Esc') {
        setOpen(group, false);
      }
    });

    group.addEventListener('keydown', function (e) {
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        setOpen(group, false);
        btn.focus();
        return;
      }
      if (idx === -1) return;
      if (e.key === 'ArrowDown' || e.key === 'Down') {
        e.preventDefault();
        (items[idx + 1] || items[0]).focus();
      } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        e.preventDefault();
        (items[idx - 1] || items[items.length - 1]).focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    });

    // Tabbing out of the group closes it. Deferred, because at focusout time the
    // incoming element is not reliably focused yet in every browser.
    group.addEventListener('focusout', function () {
      window.setTimeout(function () {
        if (!group.contains(document.activeElement)) setOpen(group, false);
      }, 0);
    });

    // Hover is a convenience for mouse users only: it must not fire on touch (where
    // it would open a menu the tap was meant to navigate) or on the stacked mobile bar.
    group.addEventListener('mouseenter', function () {
      if (!HOVERABLE.matches || MOBILE.matches) return;
      closeAll(group);
      if (!group.classList.contains('is-open')) {
        setOpen(group, true);
        // Remembered so the click that usually follows a hover doesn't undo it.
        group.dataset.hoverOpened = '1';
      }
    });
    group.addEventListener('mouseleave', function () {
      delete group.dataset.hoverOpened;
      if (!HOVERABLE.matches || MOBILE.matches) return;
      // Don't yank a menu closed out from under someone using the keyboard inside it.
      if (group.contains(document.activeElement)) return;
      setOpen(group, false);
    });
  });

  // --- hamburger -----------------------------------------------------------
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.contains('is-open');
      menu.classList.toggle('is-open', !open);
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (open) closeAll(null);
    });
  }

  // --- global dismissal ----------------------------------------------------
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) {
      closeAll(null);
      closeMobileMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var anyOpen = groups.some(function (g) { return g.classList.contains('is-open'); });
    if (anyOpen) {
      closeAll(null);
    } else if (menu && menu.classList.contains('is-open')) {
      closeMobileMenu();
      if (toggle) toggle.focus();
    }
  });

  // Coming back via the browser's back button restores the page from the back/forward
  // cache with its DOM exactly as it was left — including the dropdown that was open
  // when the link inside it was clicked. Without this, going back leaves a menu hanging
  // open over the page.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { closeAll(null); closeMobileMenu(); }
  });

  // Crossing the breakpoint leaves state that made sense in the other layout —
  // an open dropdown positioned for a bar that is now a stack, or vice versa.
  var onBreakpoint = function () { closeAll(null); closeMobileMenu(); };
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', onBreakpoint);
  else if (MOBILE.addListener) MOBILE.addListener(onBreakpoint);
})();
