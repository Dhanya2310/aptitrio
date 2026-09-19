/* ==========================================================================
   APTITRIO — script.js
   MODULE 1: Foundation + Auth + Navbar + Home + Levels + Roadmaps
   --------------------------------------------------------------------------
   SHARED DATA CONTRACT (do NOT rename core fields without informing the team)

   user  = { id, name, username, avatar, currentLevel, xp, streak, overallProgress }
   topic = { id, name, level, progress, mastery, questionsCompleted,
             currentDifficulty, unlocked, completed }
             (extras added by Module 1: subject, questionsTotal)

   PLUG-IN POINTS FOR OTHER MODULES (all exposed on window.Aptitrio)
   - Aptitrio.State.update(fn)              -> mutate shared state safely (persists + re-renders)
   - Aptitrio.Progress.updateTopic(id, {})  -> Module 2: report topic progress
   - Aptitrio.Progress.updateUser(id, {})   -> Modules 3/4: update xp, streak, etc.
   - Aptitrio.Quest.set({...})              -> Module 2: push the adaptive recommendation
   - Aptitrio.LevelStatus.unlock('intermediate') -> Module 3: unlock levels after tests
   - Aptitrio.Router.register('tests', {render(ctx){...}})
       ctx = { root, path, segments, state, router, components }
   - Events: 'aptitrio:statechange', 'aptitrio:routechange',
             'aptitrio:continue-topic' (cancelable), 'aptitrio:continue-subject' (cancelable),
             'aptitrio:levelstatuschange'
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1. CONFIG & CONSTANTS
     ====================================================================== */
  const CONFIG = {
    appName: 'APTITRIO',
    tagline: 'Your Adaptive Journey from Beginner to Interview Ready',
    // Optional: set to the path of your official logo image (e.g. 'logo.png').
    // When empty, the built-in SVG mark is used.
    logoSrc: '',
    questionsPerTopic: 10,
    placeholderTopicsPerLevel: 6,
    keys: {
      accounts: 'aptitrio.accounts.v1',
      session: 'aptitrio.session.v1',
      statePrefix: 'aptitrio.state.v1.'
    }
  };

  const EVENTS = {
    STATE_CHANGE: 'aptitrio:statechange',
    ROUTE_CHANGE: 'aptitrio:routechange',
    CONTINUE_TOPIC: 'aptitrio:continue-topic',
    CONTINUE_SUBJECT: 'aptitrio:continue-subject',
    LEVEL_STATUS_CHANGE: 'aptitrio:levelstatuschange'
  };

  const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

  const LEVELS = {
    beginner: {
      id: 'beginner',
      label: 'Beginner',
      title: 'BEGINNER',
      emoji: '🌱',
      description: 'Build a rock-solid foundation with core arithmetic concepts and essential shortcuts.',
      unlockMessage: ''
    },
    intermediate: {
      id: 'intermediate',
      label: 'Intermediate',
      title: 'INTERMEDIATE',
      emoji: '⚡',
      description: 'Sharpen speed and accuracy with multi-step problems and mixed-concept questions.',
      unlockMessage: 'Complete Beginner level and pass the Beginner Test to unlock.'
    },
    advanced: {
      id: 'advanced',
      label: 'Advanced',
      title: 'ADVANCED',
      emoji: '🔥',
      description: 'Master complex, interview-grade problems under real time pressure.',
      unlockMessage: 'Complete Intermediate level and pass the Intermediate Test to unlock.'
    }
  };

  const SUBJECTS = [
    { id: 'quant', name: 'Quantitative Aptitude', emoji: '🔢' },
    { id: 'logical', name: 'Logical Reasoning', emoji: '🧩' },
    { id: 'verbal', name: 'Verbal Ability', emoji: '📚' },
    { id: 'data', name: 'Data Interpretation', emoji: '📊' }
  ];

  const BEGINNER_TOPIC_NAMES = [
    'Number System',
    'HCF & LCM',
    'Percentages',
    'Average',
    'Ratio & Proportion',
    'Profit & Loss',
    'Simple Interest',
    'Time & Work'
  ];

  const STATUS_LABELS = {
    'completed': 'Completed',
    'in-progress': 'In Progress',
    'not-started': 'Not Started',
    'locked': 'Locked'
  };

  const PLACEHOLDER_PAGES = {
    tests: {
      eyebrow: 'Assessments',
      title: 'Tests',
      subtitle: 'Level tests and interview tests will appear here.',
      emoji: '📝',
      heading: 'Tests are on the way',
      text: 'This section is built by another module and plugs into the #/tests route.'
    },
    progress: {
      eyebrow: 'Analytics',
      title: 'Progress',
      subtitle: 'Detailed progress, badges and the leaderboard will appear here.',
      emoji: '📈',
      heading: 'Progress insights are on the way',
      text: 'This section is built by another module and plugs into the #/progress route.'
    },
    profile: {
      eyebrow: 'Account',
      title: 'Profile',
      subtitle: 'Your detailed profile, achievements and certificates will appear here.',
      emoji: '👤',
      heading: 'Profile is on the way',
      text: 'This section is built by another module and plugs into the #/profile route.'
    }
  };

  /* ======================================================================
     2. UTILITIES
     ====================================================================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad2 = (n) => String(n).padStart(2, '0');
  const slug = (s) => String(s).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const uid = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  /* Safe localStorage wrapper */
  const Store = {
    read(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    }
  };

  /* ======================================================================
     3. AUTH — modular provider (swap LocalAuthProvider for a backend later)
        Provider contract (all async except getCurrentUser/logout):
          signup({name, identifier, password}) -> {ok, user?, error?, field?}
          login({identifier, password})        -> {ok, user?, error?, field?}
          logout()
          getCurrentUser()                     -> {id, name, username} | null
     ====================================================================== */
  const LocalAuthProvider = (() => {
    // NOTE: mock hashing for MVP only. A real backend must hash on the server.
    function hashPassword(password, salt) {
      const input = salt + '::' + password;
      let h1 = 2166136261;
      let h2 = 5381;
      for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 16777619);
        h2 = (Math.imul(h2, 33) + c) | 0;
      }
      return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    }

    const publicUser = (a) => ({ id: a.id, name: a.name, username: a.username });
    const readAccounts = () => Store.read(CONFIG.keys.accounts, {});

    return {
      async signup(data) {
        await delay(350);
        const accounts = readAccounts();
        const key = data.identifier.trim().toLowerCase();
        if (accounts[key]) {
          return { ok: false, field: 'identifier', error: 'An account with this username or email already exists.' };
        }
        const account = {
          id: uid(),
          name: data.name.trim(),
          username: data.identifier.trim(),
          passwordHash: hashPassword(data.password, key),
          createdAt: Date.now()
        };
        accounts[key] = account;
        if (!Store.write(CONFIG.keys.accounts, accounts)) {
          return { ok: false, error: 'Could not save your account. Please check your browser storage settings.' };
        }
        Store.write(CONFIG.keys.session, account.id);
        return { ok: true, user: publicUser(account) };
      },

      async login(data) {
        await delay(350);
        const accounts = readAccounts();
        const key = data.identifier.trim().toLowerCase();
        const account = accounts[key];
        if (!account || account.passwordHash !== hashPassword(data.password, key)) {
          return { ok: false, error: 'Incorrect username/email or password.' };
        }
        Store.write(CONFIG.keys.session, account.id);
        return { ok: true, user: publicUser(account) };
      },

      logout() {
        Store.remove(CONFIG.keys.session);
      },

      getCurrentUser() {
        const id = Store.read(CONFIG.keys.session, null);
        if (!id) return null;
        const account = Object.values(readAccounts()).find((a) => a.id === id);
        return account ? publicUser(account) : null;
      }
    };
  })();

  const Auth = LocalAuthProvider;

  /* ======================================================================
     4. SHARED STATE
     ====================================================================== */
  function makeTopic(name, level, subject) {
    return {
      id: slug(name),
      name: name,
      level: level,
      progress: 0,
      mastery: 0,
      questionsCompleted: 0,
      currentDifficulty: 'Easy',
      unlocked: level === 'beginner',
      completed: false,
      subject: subject || 'quant',
      questionsTotal: CONFIG.questionsPerTopic
    };
  }

  function normalizeTopic(t) {
    return Object.assign({
      id: '',
      name: '',
      level: 'beginner',
      progress: 0,
      mastery: 0,
      questionsCompleted: 0,
      currentDifficulty: 'Easy',
      unlocked: false,
      completed: false,
      subject: 'quant',
      questionsTotal: CONFIG.questionsPerTopic
    }, t);
  }

  function makeSubject(s) {
    return {
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      progress: 0,
      questionsCompleted: 0,
      currentDifficulty: 'Easy'
    };
  }

  /* Derived values (kept in sync automatically after every state update) */
  function deriveStats(s) {
    s.subjects.forEach((subj) => {
      const list = s.topics.filter((t) => t.subject === subj.id);
      if (!list.length) return;
      subj.progress = Math.round(list.reduce((a, t) => a + clamp(Number(t.progress) || 0, 0, 100), 0) / list.length);
      subj.questionsCompleted = list.reduce((a, t) => a + (Number(t.questionsCompleted) || 0), 0);
      const active = list.find((t) => t.unlocked && !t.completed);
      if (active) subj.currentDifficulty = active.currentDifficulty;
    });
    s.user.overallProgress = s.subjects.length
      ? Math.round(s.subjects.reduce((a, x) => a + clamp(Number(x.progress) || 0, 0, 100), 0) / s.subjects.length)
      : 0;
  }

  const State = (() => {
    let current = null;
    let storageKey = null;

    const keyFor = (id) => CONFIG.keys.statePrefix + id;

    function createInitial(authUser) {
      const s = {
        schemaVersion: 1,
        user: {
          id: authUser.id,
          name: authUser.name,
          username: authUser.username,
          avatar: '',
          currentLevel: 'beginner',
          xp: 0,
          streak: 0,
          overallProgress: 0
        },
        levels: {
          beginner: { unlocked: true },
          intermediate: { unlocked: false },
          advanced: { unlocked: false }
        },
        topics: BEGINNER_TOPIC_NAMES.map((n) => makeTopic(n, 'beginner', 'quant')),
        subjects: SUBJECTS.map(makeSubject),
        quest: { topicId: null, recommendedActivity: '', difficulty: '' }
      };
      deriveStats(s);
      return s;
    }

    function mergeDefaults(saved, authUser) {
      const base = createInitial(authUser);
      const s = Object.assign({}, base, saved);
      s.user = Object.assign({}, base.user, saved.user || {}, {
        id: authUser.id,
        name: authUser.name,
        username: authUser.username
      });
      s.levels = Object.assign({}, base.levels, saved.levels || {});
      s.topics = Array.isArray(saved.topics) ? saved.topics.map(normalizeTopic) : [];
      base.topics.forEach((t) => {
        if (!s.topics.some((x) => x.id === t.id)) s.topics.push(t);
      });
      s.subjects = Array.isArray(saved.subjects) ? saved.subjects.slice() : [];
      base.subjects.forEach((sub) => {
        if (!s.subjects.some((x) => x.id === sub.id)) s.subjects.push(sub);
      });
      s.quest = Object.assign({}, base.quest, saved.quest || {});
      deriveStats(s);
      return s;
    }

    function persist() {
      if (current && storageKey) Store.write(storageKey, current);
    }

    function emit(reason) {
      document.dispatchEvent(new CustomEvent(EVENTS.STATE_CHANGE, { detail: { reason: reason, state: current } }));
    }

    return {
      load(authUser) {
        storageKey = keyFor(authUser.id);
        const saved = Store.read(storageKey, null);
        current = saved ? mergeDefaults(saved, authUser) : createInitial(authUser);
        persist();
        emit('load');
        return current;
      },
      reload() {
        if (!storageKey) return;
        const saved = Store.read(storageKey, null);
        if (saved && current) {
          current = mergeDefaults(saved, { id: current.user.id, name: current.user.name, username: current.user.username });
          emit('reload');
        }
      },
      unload() {
        current = null;
        storageKey = null;
        emit('unload');
      },
      get() { return current; },
      isReady() { return !!current; },
      storageKey() { return storageKey; },
      update(mutator, reason) {
        if (!current) return null;
        mutator(current);
        deriveStats(current);
        persist();
        emit(reason || 'update');
        return current;
      }
    };
  })();

  /* ======================================================================
     5. PROGRESS / LEVEL STATUS / QUEST (shared services)
     ====================================================================== */
  const Progress = {
    getUser() { const s = State.get(); return s ? s.user : null; },
    getTopics(levelId) {
      const s = State.get();
      if (!s) return [];
      return s.topics.filter((t) => !levelId || t.level === levelId);
    },
    getTopic(id) {
      const s = State.get();
      return s ? s.topics.find((t) => t.id === id) || null : null;
    },
    getSubjects() { const s = State.get(); return s ? s.subjects : []; },
    countCompleted() { return this.getTopics().filter((t) => t.completed).length; },
    countTotal() { return this.getTopics().length; },

    updateTopic(id, patch) {
      State.update((s) => {
        const t = s.topics.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }, 'topic');
    },
    addTopics(list) {
      State.update((s) => {
        (list || []).forEach((t) => {
          if (!s.topics.some((x) => x.id === t.id)) s.topics.push(normalizeTopic(t));
        });
      }, 'topics-added');
    },
    updateSubject(id, patch) {
      State.update((s) => {
        const sub = s.subjects.find((x) => x.id === id);
        if (sub) Object.assign(sub, patch);
      }, 'subject');
    },
    updateUser(patch) {
      State.update((s) => { Object.assign(s.user, patch); }, 'user');
    },

    getNextTopic() {
      const s = State.get();
      if (!s) return null;
      const pool = s.topics.filter((t) => t.unlocked && !t.completed);
      if (!pool.length) return null;
      const rank = (t) => (t.level === s.user.currentLevel ? 0 : 2) + (t.progress > 0 ? 0 : 1);
      return pool.slice().sort((a, b) => rank(a) - rank(b))[0];
    }
  };

  const LevelStatus = {
    isUnlocked(id) {
      const s = State.get();
      return !!(s && s.levels[id] && s.levels[id].unlocked);
    },
    set(id, unlocked) {
      if (!LEVELS[id]) return false;
      State.update((s) => {
        s.levels[id] = Object.assign({}, s.levels[id], { unlocked: !!unlocked });
        s.topics.forEach((t) => { if (t.level === id) t.unlocked = !!unlocked; });
      }, 'level-status');
      document.dispatchEvent(new CustomEvent(EVENTS.LEVEL_STATUS_CHANGE, { detail: { levelId: id, unlocked: !!unlocked } }));
      return true;
    },
    unlock(id) { return this.set(id, true); },
    lock(id) { return this.set(id, false); },
    getStats(id) {
      const list = Progress.getTopics(id);
      const total = list.length;
      const completed = list.filter((t) => t.completed).length;
      const progress = total
        ? Math.round(list.reduce((a, t) => a + clamp(Number(t.progress) || 0, 0, 100), 0) / total)
        : 0;
      return { total: total, completed: completed, progress: progress };
    },
    getAll() {
      return LEVEL_ORDER.map((id) => Object.assign({ id: id, unlocked: this.isUnlocked(id) }, this.getStats(id)));
    }
  };

  const Quest = {
    /* Module 2 calls Quest.set({ topicId, recommendedActivity, difficulty }) */
    set(rec) {
      State.update((s) => {
        s.quest = Object.assign({}, s.quest, rec || {});
      }, 'quest');
    },
    get() {
      const s = State.get();
      if (!s) return null;
      let topic = s.quest.topicId ? s.topics.find((t) => t.id === s.quest.topicId) : null;
      if (!topic || !topic.unlocked) topic = Progress.getNextTopic();
      if (!topic) return null;
      const custom = s.quest.topicId === topic.id;
      const fallbackActivity = topic.completed
        ? 'Review this topic to keep it fresh'
        : topic.progress > 0
          ? 'Continue your adaptive practice set'
          : 'Start your first adaptive practice set';
      return {
        topic: topic,
        difficulty: (custom && s.quest.difficulty) || topic.currentDifficulty,
        progress: topic.progress,
        activity: (custom && s.quest.recommendedActivity) || fallbackActivity
      };
    }
  };

  /* ======================================================================
     6. REUSABLE COMPONENTS (return HTML strings — never duplicated elsewhere)
     ====================================================================== */
  const ICON_PATHS = {
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
    target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
  };

  function Icon(name) {
    return '<svg class="icon icon--' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON_PATHS[name] || '') + '</svg>';
  }

  function Logo(o) {
    o = o || {};
    const size = o.size || 'md';
    const mark = CONFIG.logoSrc
      ? '<img class="logo__img" src="' + esc(CONFIG.logoSrc) + '" alt="">'
      : '<svg class="logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
          '<rect width="48" height="48" rx="14" fill="url(#aptLogoGradient)"></rect>' +
          '<path d="M14 35 L24 13 L34 35" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>' +
          '<path d="M19 28 H29" stroke="#E9DDFF" stroke-width="4" stroke-linecap="round"></path>' +
          '<circle cx="35" cy="12" r="3" fill="#E9DDFF"></circle>' +
        '</svg>';
    return '<span class="logo logo--' + size + (o.inverse ? ' logo--inverse' : '') + '">' +
      mark +
      '<span class="logo__text"><span class="logo__word">' + esc(CONFIG.appName) + '</span>' +
      (o.tagline ? '<span class="logo__tagline">' + esc(CONFIG.tagline) + '</span>' : '') +
      '</span></span>';
  }

  function Avatar(o) {
    o = o || {};
    const size = o.size || 'md';
    const inner = o.src
      ? '<img class="avatar__img" src="' + esc(o.src) + '" alt="">'
      : '<span aria-hidden="true">' + esc(initials(o.name)) + '</span>';
    return '<span class="avatar avatar--' + size + '" title="' + esc(o.name || '') + '">' + inner + '</span>';
  }

  function Button(o) {
    const variant = o.variant || 'primary';
    const size = o.size || 'md';
    const cls = 'btn btn--' + variant + ' btn--' + size + (o.block ? ' btn--block' : '') + (o.className ? ' ' + o.className : '');
    const data = o.data || {};
    const dataAttrs = Object.keys(data).map((k) => ' data-' + k + '="' + esc(data[k]) + '"').join('');
    const inner = '<span class="btn__label">' + esc(o.label) + '</span>' + (o.icon ? Icon(o.icon) : '');
    if (o.href && !o.disabled) {
      return '<a class="' + cls + '" href="' + esc(o.href) + '"' + dataAttrs + '>' + inner + '</a>';
    }
    return '<button class="' + cls + '" type="' + (o.type || 'button') + '"' + (o.disabled ? ' disabled' : '') + dataAttrs + '>' + inner + '</button>';
  }

  function ProgressBar(o) {
    const v = Math.round(clamp(Number(o.value) || 0, 0, 100));
    const head = (o.label || o.showValue)
      ? '<div class="progress__head"><span>' + esc(o.label || '') + '</span>' + (o.showValue ? '<strong>' + v + '%</strong>' : '') + '</div>'
      : '';
    return '<div class="progress-wrap">' + head +
      '<div class="progress progress--' + (o.size || 'md') + (o.onDark ? ' progress--on-dark' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="' + esc(o.ariaLabel || o.label || 'Progress') + '">' +
      '<div class="progress__fill" data-value="' + v + '"></div></div></div>';
  }

  function Card(o) {
    o = o || {};
    const tag = o.tag || 'div';
    const cls = 'card' + (o.className ? ' ' + o.className : '');
    const attrs = o.attrs ? ' ' + o.attrs : '';
    const style = o.index !== undefined ? ' style="--i:' + (Number(o.index) || 0) + '"' : '';
    const head = o.title
      ? '<header class="card__header"><h3 class="card__title">' + esc(o.title) + '</h3>' +
        (o.subtitle ? '<p class="card__subtitle">' + esc(o.subtitle) + '</p>' : '') + '</header>'
      : '';
    return '<' + tag + ' class="' + cls + '"' + attrs + style + '>' + head + (o.body || '') + '</' + tag + '>';
  }

  function PageContainer(o) {
    return '<div class="page-container">' +
      '<header class="page-header">' +
        (o.eyebrow ? '<p class="eyebrow">' + esc(o.eyebrow) + '</p>' : '') +
        '<h1 tabindex="-1">' + esc(o.title) + '</h1>' +
        (o.subtitle ? '<p class="page-subtitle">' + esc(o.subtitle) + '</p>' : '') +
      '</header>' +
      '<div class="page-body">' + (o.content || '') + '</div>' +
    '</div>';
  }

  function LockedCard(o) {
    const H = o.tag || 'h3';
    return Card({
      className: 'locked-card' + (o.compact ? ' locked-card--compact' : ''),
      body:
        '<span class="locked-card__icon">' + Icon('lock') + '</span>' +
        '<div class="locked-card__body">' +
          '<' + H + ' class="locked-card__title"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (H === 'h1' ? ' tabindex="-1"' : '') + '>' + esc(o.title) + '</' + H + '>' +
          '<p class="locked-card__msg">' + esc(o.message) + '</p>' +
          (o.cta || '') +
        '</div>'
    });
  }

  function difficultyChip(diff) {
    return '<span class="chip chip--' + esc(String(diff || 'Easy').toLowerCase()) + '">' + esc(diff || 'Easy') + '</span>';
  }

  function topicStatus(t) {
    if (t.completed) return 'completed';
    if (!t.unlocked) return 'locked';
    if (t.progress > 0) return 'in-progress';
    return 'not-started';
  }

  function StatusBadge(status) {
    return '<span class="badge badge--' + status + '">' + (status === 'locked' ? Icon('lock') + ' ' : '') + esc(STATUS_LABELS[status]) + '</span>';
  }

  function TopicCard(topic, o) {
    o = o || {};
    const index = o.index || 0;

    if (!topic) {
      return Card({
        tag: 'article',
        className: 'topic-card topic-card--placeholder is-locked',
        index: index,
        body:
          '<div class="topic-card__top"><span class="topic-card__index">' + pad2(index + 1) + '</span>' + StatusBadge('locked') + '</div>' +
          '<h3 class="topic-card__name">Topic coming soon</h3>' +
          '<div class="skeleton-lines" aria-hidden="true"><span></span><span></span></div>' +
          '<p class="topic-card__hint">This topic will be added in a future update.</p>' +
          Button({ label: 'Locked', variant: 'ghost', disabled: true, icon: 'lock', block: true })
      });
    }

    const status = topicStatus(topic);
    const total = topic.questionsTotal || CONFIG.questionsPerTopic;
    const btn = status === 'locked'
      ? Button({ label: 'Locked', variant: 'ghost', disabled: true, icon: 'lock', block: true })
      : Button({
          label: status === 'completed' ? 'Review' : 'Continue',
          variant: status === 'completed' ? 'secondary' : 'primary',
          block: true,
          icon: 'arrow',
          data: { action: 'continue-topic', 'topic-id': topic.id }
        });

    return Card({
      tag: 'article',
      className: 'topic-card is-' + status,
      attrs: 'data-topic-id="' + esc(topic.id) + '"',
      index: index,
      body:
        '<div class="topic-card__top"><span class="topic-card__index">' + pad2(index + 1) + '</span>' + StatusBadge(status) + '</div>' +
        '<h3 class="topic-card__name">' + esc(topic.name) + '</h3>' +
        '<div class="topic-card__meta">' + difficultyChip(topic.currentDifficulty) +
          '<span><strong>' + esc(topic.questionsCompleted) + ' / ' + esc(total) + '</strong> Questions</span></div>' +
        ProgressBar({ value: topic.progress, label: Math.round(topic.progress) + '% Complete', size: 'md', ariaLabel: topic.name + ' progress' }) +
        btn
    });
  }

  function RoadmapItem(topic, index) {
    const status = topic ? topicStatus(topic) : 'locked';
    const node = status === 'completed' ? Icon('check') : status === 'locked' ? Icon('lock') : String(index + 1);
    return '<li class="roadmap__item is-' + status + '" style="--i:' + index + '">' +
      '<span class="roadmap__node" aria-hidden="true">' + node + '</span>' +
      TopicCard(topic, { index: index }) +
    '</li>';
  }

  function LevelCard(levelId, index) {
    const L = LEVELS[levelId];
    const st = LevelStatus.getStats(levelId);
    const unlocked = LevelStatus.isUnlocked(levelId);
    const badge = unlocked
      ? '<span class="badge badge--unlocked">Unlocked</span>'
      : '<span class="badge badge--locked">' + Icon('lock') + ' Locked</span>';
    return Card({
      tag: 'article',
      className: 'level-card' + (unlocked ? '' : ' is-locked'),
      attrs: 'data-level-id="' + levelId + '"',
      index: index,
      body:
        '<div class="level-card__top"><span class="level-card__emoji" aria-hidden="true">' + L.emoji + '</span>' + badge + '</div>' +
        '<h2 class="level-card__name">' + esc(L.title) + '</h2>' +
        '<p class="level-card__desc">' + esc(L.description) + '</p>' +
        '<dl class="stat-row">' +
          '<div><dt>Topics</dt><dd>' + (st.total ? st.total : 'TBA') + '</dd></div>' +
          '<div><dt>Completed</dt><dd>' + st.completed + (st.total ? ' / ' + st.total : '') + '</dd></div>' +
          '<div><dt>Completion</dt><dd>' + st.progress + '%</dd></div>' +
        '</dl>' +
        ProgressBar({ value: st.progress, ariaLabel: L.label + ' completion' }) +
        (unlocked ? '' : '<p class="level-card__hint">' + Icon('lock') + '<span>' + esc(L.unlockMessage) + '</span></p>') +
        Button({
          label: unlocked ? 'Open Roadmap' : 'Preview Roadmap',
          variant: unlocked ? 'primary' : 'secondary',
          icon: 'arrow',
          block: true,
          href: '#/levels/' + levelId
        })
    });
  }

  function SummaryCard(o) {
    const value = typeof o.count === 'number'
      ? '<span data-count="' + o.count + '">' + o.count + '</span>' + (o.suffix ? '<small>' + esc(o.suffix) + '</small>' : '')
      : esc(o.value);
    return Card({
      className: 'summary-card',
      index: o.index,
      body:
        '<span class="summary-card__icon">' + Icon(o.icon) + '</span>' +
        '<div class="summary-card__text">' +
          '<span class="summary-card__label">' + esc(o.label) + '</span>' +
          '<strong class="summary-card__value">' + value + '</strong>' +
          (o.hint ? '<span class="summary-card__hint">' + esc(o.hint) + '</span>' : '') +
        '</div>' +
        (o.progress !== undefined ? ProgressBar({ value: o.progress, size: 'sm', ariaLabel: o.label }) : '')
    });
  }

  function SubjectCard(subj, index) {
    return Card({
      tag: 'article',
      className: 'subject-card',
      attrs: 'data-subject-id="' + esc(subj.id) + '"',
      index: index,
      body:
        '<div class="subject-card__head"><span class="subject-card__emoji" aria-hidden="true">' + esc(subj.emoji) + '</span>' +
          '<span class="subject-card__pct">' + Math.round(subj.progress) + '%</span></div>' +
        '<h3 class="subject-card__name">' + esc(subj.name) + '</h3>' +
        ProgressBar({ value: subj.progress, ariaLabel: subj.name + ' completion' }) +
        '<dl class="subject-card__stats">' +
          '<div><dt>Questions completed</dt><dd>' + esc(subj.questionsCompleted) + '</dd></div>' +
          '<div><dt>Current difficulty</dt><dd>' + difficultyChip(subj.currentDifficulty) + '</dd></div>' +
        '</dl>' +
        Button({ label: 'Continue', variant: 'secondary', icon: 'arrow', block: true, data: { action: 'continue-subject', 'subject-id': subj.id } })
    });
  }

  function QuestCard(q) {
    if (!q) {
      return Card({
        className: 'quest quest--empty',
        body:
          '<div class="quest__inner"><div>' +
            '<span class="quest__tag">' + Icon('target') + ' CONTINUE YOUR QUEST</span>' +
            '<h2 class="quest__title">You are all caught up</h2>' +
            '<p>There are no open topics right now. Explore the levels to see what is next on your journey.</p>' +
            Button({ label: 'View Levels', variant: 'light', size: 'lg', icon: 'arrow', href: '#/levels' }) +
          '</div></div>'
      });
    }
    const p = Math.round(clamp(Number(q.progress) || 0, 0, 100));
    return Card({
      className: 'quest',
      body:
        '<div class="quest__inner">' +
          '<div class="quest__main">' +
            '<span class="quest__tag">' + Icon('target') + ' CONTINUE YOUR QUEST</span>' +
            '<h2 class="quest__title">' + esc(q.topic.name) + '</h2>' +
            '<p class="quest__topic-label">Current topic</p>' +
            '<div class="quest__meta">' +
              '<div class="quest__meta-item"><span class="quest__label">Current difficulty</span>' + difficultyChip(q.difficulty) + '</div>' +
              '<div class="quest__meta-item"><span class="quest__label">Topic progress</span><span class="quest__value">' + p + '% complete</span></div>' +
              '<div class="quest__meta-item"><span class="quest__label">Recommended activity</span><span class="quest__value">' + esc(q.activity) + '</span></div>' +
            '</div>' +
            '<div class="quest__progress">' + ProgressBar({ value: p, size: 'lg', onDark: true, ariaLabel: q.topic.name + ' progress' }) + '</div>' +
            Button({ label: 'Continue Quest', variant: 'light', size: 'lg', icon: 'arrow', data: { action: 'continue-topic', 'topic-id': q.topic.id } }) +
          '</div>' +
          '<div class="quest__ring" style="--p:' + p + '" role="img" aria-label="' + p + '% complete"><span>' + p + '%</span></div>' +
        '</div>'
    });
  }

  const Components = {
    Icon: Icon, Logo: Logo, Avatar: Avatar, Button: Button, ProgressBar: ProgressBar,
    Card: Card, PageContainer: PageContainer, LockedCard: LockedCard, LevelCard: LevelCard,
    TopicCard: TopicCard, SummaryCard: SummaryCard, SubjectCard: SubjectCard, QuestCard: QuestCard
  };

  /* Post-render: animate progress bars and counters */
  function animateCount(el) {
    const target = Number(el.dataset.count) || 0;
    const start = performance.now();
    const duration = 750;
    function frame(now) {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    el.textContent = '0';
    requestAnimationFrame(frame);
  }

  function hydrate(root) {
    if (!root) return;
    const fills = $$('.progress__fill', root);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fills.forEach((f) => { f.style.width = f.dataset.value + '%'; });
    }));
    if (!reducedMotion()) $$('[data-count]', root).forEach(animateCount);
  }

  /* ======================================================================
     7. TOAST
     ====================================================================== */
  const Toast = {
    show(message, type, duration) {
      const region = $('#toastRegion');
      if (!region) return;
      const el = document.createElement('div');
      el.className = 'toast toast--' + (type || 'info');
      el.textContent = message;
      region.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-visible'));
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 380);
      }, duration || 3600);
    }
  };

  /* ======================================================================
     8. NAVBAR (single, reusable)
     ====================================================================== */
  const Navbar = (() => {
    let toggle, menu, bar;

    function isOpen() { return menu && menu.classList.contains('is-open'); }

    function open() {
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('menu-open');
    }
    function close() {
      if (!menu) return;
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-open');
    }

    return {
      init() {
        bar = $('#navbar');
        toggle = $('#menuToggle');
        menu = $('#navMenu');
        toggle.addEventListener('click', () => (isOpen() ? close() : open()));
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { close(); toggle.focus(); } });
        document.addEventListener('click', (e) => {
          if (isOpen() && !e.target.closest('#navbar')) close();
        });
        window.addEventListener('resize', () => { if (window.innerWidth > 900) close(); });
      },
      setVisible(visible) { if (bar) bar.hidden = !visible; if (!visible) close(); },
      closeMenu: close,
      setActive(path) {
        const head = String(path || '').split('/')[0];
        $$('[data-nav]').forEach((a) => {
          const on = a.dataset.nav === head;
          a.classList.toggle('is-active', on);
          if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
      },
      refresh() {
        const holder = $('#navAvatar');
        if (!holder) return;
        const s = State.get();
        holder.innerHTML = s ? Avatar({ name: s.user.name, src: s.user.avatar, size: 'sm' }) : '';
        const link = $('#navProfile');
        if (link) link.setAttribute('aria-label', s ? 'Open profile — ' + s.user.name : 'Open profile');
      }
    };
  })();

  /* ======================================================================
     9. PAGE RENDERERS
     ====================================================================== */
  function renderHome() {
    const s = State.get();
    if (!s) return;
    const u = s.user;
    const L = LEVELS[u.currentLevel] || LEVELS.beginner;

    $('#welcomeHeading').textContent = 'Welcome back, ' + u.name + '!';

    const cards = [
      { icon: 'zap', label: 'Total XP', count: Number(u.xp) || 0 },
      { icon: 'layers', label: 'Current Level', value: L.emoji + ' ' + L.label },
      { icon: 'chart', label: 'Overall Progress', count: Number(u.overallProgress) || 0, suffix: '%', progress: u.overallProgress },
      { icon: 'flame', label: 'Current Streak', count: Number(u.streak) || 0, suffix: Number(u.streak) === 1 ? ' day' : ' days' },
      { icon: 'checkCircle', label: 'Completed Topics', value: Progress.countCompleted() + ' / ' + Progress.countTotal() }
    ];
    $('#summaryCards').innerHTML = cards.map((c, i) => SummaryCard(Object.assign({ index: i }, c))).join('');

    $('#questCard').innerHTML = QuestCard(Quest.get());
    $('#subjectGrid').innerHTML = s.subjects.map((sub, i) => SubjectCard(sub, i)).join('');

    hydrate($('#page-home'));
  }

  function renderLevels() {
    $('#levelsGrid').innerHTML = LEVEL_ORDER.map((id, i) => LevelCard(id, i)).join('');
    hydrate($('#page-levels'));
  }

  function renderLevel(levelId) {
    const L = LEVELS[levelId];
    const unlocked = LevelStatus.isUnlocked(levelId);
    const st = LevelStatus.getStats(levelId);
    const hero = $('#levelHero');
    const lock = $('#levelLock');
    const roadmap = $('#levelRoadmap');

    if (unlocked) {
      hero.hidden = false;
      hero.innerHTML =
        '<div class="level-hero__emoji" aria-hidden="true">' + L.emoji + '</div>' +
        '<div class="level-hero__main">' +
          '<p class="eyebrow">Learning roadmap</p>' +
          '<h1 id="levelTitle" tabindex="-1">' + esc(L.title) + '</h1>' +
          '<p class="page-subtitle">' + esc(L.description) + '</p>' +
        '</div>' +
        '<div class="level-hero__stats">' +
          '<div class="level-hero__stat-row">' +
            '<div class="level-hero__stat"><span>Topics</span><strong>' + (st.total || 'TBA') + '</strong></div>' +
            '<div class="level-hero__stat"><span>Completed</span><strong>' + st.completed + (st.total ? ' / ' + st.total : '') + '</strong></div>' +
            '<div class="level-hero__stat"><span>Completion</span><strong>' + st.progress + '%</strong></div>' +
          '</div>' +
          ProgressBar({ value: st.progress, size: 'md', onDark: true, ariaLabel: L.label + ' completion' }) +
        '</div>';
      lock.innerHTML = '';
    } else {
      hero.hidden = true;
      hero.innerHTML = '';
      lock.innerHTML = LockedCard({
        tag: 'h1',
        id: 'levelTitle',
        title: '🔒 ' + L.title,
        message: L.unlockMessage,
        cta: Button({ label: 'Back to Levels', variant: 'secondary', href: '#/levels', icon: 'arrow' })
      });
    }

    const topics = Progress.getTopics(levelId);
    const items = topics.length
      ? topics.map((t, i) => RoadmapItem(t, i))
      : Array.from({ length: CONFIG.placeholderTopicsPerLevel }, (_, i) => RoadmapItem(null, i));
    roadmap.innerHTML = items.join('');
    roadmap.dataset.level = levelId;

    hydrate($('#page-level'));
  }

  function renderHostPlaceholder(page) {
    const cfg = PLACEHOLDER_PAGES[page];
    const root = $('#' + page + 'Root');
    if (!root || !cfg) return;
    root.innerHTML = PageContainer({
      eyebrow: cfg.eyebrow,
      title: cfg.title,
      subtitle: cfg.subtitle,
      content: Card({
        className: 'placeholder-card',
        body:
          '<span class="placeholder-card__emoji" aria-hidden="true">' + cfg.emoji + '</span>' +
          '<div><h2>' + esc(cfg.heading) + '</h2><p>' + esc(cfg.text) + '</p></div>'
      })
    });
  }

  function renderNotFound() {
    $('#notFoundRoot').innerHTML = PageContainer({
      eyebrow: 'Error 404',
      title: 'Page not found',
      subtitle: 'The page you are looking for does not exist or has moved.',
      content: Button({ label: 'Go to Home', href: '#/home', icon: 'arrow', size: 'lg' })
    });
  }

  /* ======================================================================
     10. ROUTER (hash-based — works with Live Server, no server config)
         Routes: #/login #/signup #/home #/levels #/levels/:level
                 #/tests #/progress #/profile
     ====================================================================== */
  const Router = (() => {
    const registry = new Map();
    let current = null;
    let cleanup = null;
    let firstShow = true;

    const HOSTS = { tests: '#testsRoot', progress: '#progressRoot', profile: '#profileRoot', module: '#moduleRoot' };
    const TITLES = {
      login: 'Log in', signup: 'Sign up', home: 'Home', levels: 'Levels',
      tests: 'Tests', progress: 'Progress', profile: 'Profile', module: 'APTITRIO', notfound: 'Page not found'
    };

    const normalize = (p) => String(p || '').replace(/^#?\/*/, '').replace(/\/+$/, '').toLowerCase();
    const currentPath = () => normalize(location.hash.split('?')[0]);

    function findHandler(path) {
      const segs = path.split('/');
      for (let i = segs.length; i > 0; i--) {
        const key = segs.slice(0, i).join('/');
        if (registry.has(key)) return { key: key, entry: registry.get(key), segments: segs.slice(i) };
      }
      return null;
    }

    function match(path) {
      const segs = path.split('/');
      const head = segs[0];
      if (segs.length === 1 && ['login', 'signup', 'home', 'levels'].indexOf(head) !== -1) return { page: head, path: path };
      if (head === 'levels' && segs.length === 2) {
        return LEVELS[segs[1]] ? { page: 'level', levelId: segs[1], path: path } : { page: 'notfound', path: path };
      }
      const found = findHandler(path);
      if (['tests', 'progress', 'profile'].indexOf(head) !== -1) return { page: head, path: path, found: found };
      if (found) return { page: 'module', path: path, found: found };
      return { page: 'notfound', path: path };
    }

    function renderHost(m, fromState) {
      if (m.found) {
        if (fromState) return;
        const root = $(HOSTS[m.page]);
        root.innerHTML = '';
        const entry = m.found.entry;
        const result = entry.render({
          root: root,
          path: m.path,
          segments: m.found.segments,
          state: State.get(),
          router: api,
          components: Components
        });
        if (typeof result === 'function') cleanup = result;
        return;
      }
      if (m.page === 'module') return;
      renderHostPlaceholder(m.page);
    }

    function renderPage(m, fromState) {
      switch (m.page) {
        case 'login':
          if (!fromState) Forms.reset($('#loginForm'));
          break;
        case 'signup':
          if (!fromState) Forms.reset($('#signupForm'));
          break;
        case 'home': renderHome(); break;
        case 'levels': renderLevels(); break;
        case 'level': renderLevel(m.levelId); break;
        case 'tests':
        case 'progress':
        case 'profile':
        case 'module':
          renderHost(m, fromState);
          break;
        case 'notfound': renderNotFound(); break;
        default: break;
      }
    }

    function redirect(path) {
      history.replaceState(null, '', '#/' + path);
      resolve();
    }

    function resolve(opts) {
      const fromState = !!(opts && opts.fromState);
      const loggedIn = State.isReady();
      const path = currentPath();

      if (!path) { redirect(loggedIn ? 'home' : 'login'); return; }

      const isAuthRoute = path === 'login' || path === 'signup';
      if (!loggedIn && !isAuthRoute) { redirect('login'); return; }
      if (loggedIn && isAuthRoute) { redirect('home'); return; }

      const m = match(path);

      if (fromState) {
        if (current && current.path === m.path) renderPage(current, true);
        return;
      }

      if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } }
      cleanup = null;
      current = m;

      const isAuth = m.page === 'login' || m.page === 'signup';
      document.body.classList.toggle('is-auth', isAuth);
      document.body.dataset.route = m.page;
      Navbar.setVisible(!isAuth);
      Navbar.setActive(m.path);

      $$('.page').forEach((p) => {
        const active = p.dataset.page === m.page;
        p.hidden = !active;
        p.classList.remove('is-active');
        if (active) { void p.offsetWidth; p.classList.add('is-active'); }
      });

      renderPage(m, false);

      let title = TITLES[m.page] || 'APTITRIO';
      if (m.page === 'level') title = LEVELS[m.levelId].label + ' Roadmap';
      document.title = title + ' · ' + CONFIG.appName;

      if (!firstShow) {
        window.scrollTo(0, 0);
        const pageEl = $('#page-' + m.page);
        const h = pageEl && $('h1', pageEl);
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }
      firstShow = false;

      document.dispatchEvent(new CustomEvent(EVENTS.ROUTE_CHANGE, { detail: { path: m.path, page: m.page } }));
    }

    const api = {
      init() { window.addEventListener('hashchange', () => resolve()); resolve(); },
      resolve: resolve,
      rerender() { resolve({ fromState: true }); },
      go(path, opts) {
        const target = '#/' + normalize(path);
        if (opts && opts.replace) { history.replaceState(null, '', target); resolve(); return; }
        if (location.hash === target) { resolve(); return; }
        location.hash = target;
      },
      register(path, handler, options) {
        const entry = typeof handler === 'function'
          ? { render: handler }
          : Object.assign({}, handler);
        if (options && options.title) entry.title = options.title;
        registry.set(normalize(path), entry);
      },
      has(path) { return registry.has(normalize(path)); },
      current() { return current; }
    };
    return api;
  })();

  /* ======================================================================
     11. FORMS — validation + login/signup handlers
     ====================================================================== */
  const Forms = (() => {
    const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const RE_USERNAME = /^[a-zA-Z0-9._-]{3,24}$/;

    function validateName(v) {
      v = v.trim();
      if (!v) return 'Please enter your name.';
      if (v.length < 2) return 'Name must be at least 2 characters.';
      if (v.length > 40) return 'Name must be 40 characters or fewer.';
      if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(v)) return 'Use letters, spaces, dots, hyphens or apostrophes only.';
      return '';
    }
    function validateIdentifier(v) {
      v = v.trim();
      if (!v) return 'Enter your username or email.';
      if (v.indexOf('@') !== -1) return RE_EMAIL.test(v) ? '' : 'Enter a valid email address.';
      return RE_USERNAME.test(v) ? '' : 'Username must be 3–24 characters: letters, numbers, dot, dash or underscore.';
    }
    function validatePassword(v, strict) {
      if (!v) return 'Enter your password.';
      if (strict) {
        if (v.length < 6) return 'Password must be at least 6 characters.';
        if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Use at least one letter and one number.';
      }
      return '';
    }
    function validateConfirm(pw, c) {
      if (!c) return 'Confirm your password.';
      if (pw !== c) return 'Passwords do not match.';
      return '';
    }

    const fieldOf = (input) => input.closest('.field');

    function setError(input, msg) {
      const f = fieldOf(input);
      if (!f) return;
      const err = $('.field__error', f);
      if (err) err.textContent = msg || '';
      f.classList.toggle('has-error', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function setFormError(form, msg) {
      const el = $('.form-error', form);
      if (!el) return;
      el.textContent = msg || '';
      el.hidden = !msg;
    }

    function setBusy(form, busy) {
      const btn = $('button[type="submit"]', form);
      if (!btn) return;
      btn.disabled = busy;
      btn.classList.toggle('is-loading', busy);
    }

    function reset(form) {
      if (!form) return;
      form.reset();
      $$('.input', form).forEach((i) => { setError(i, ''); delete i.dataset.touched; });
      setFormError(form, '');
      setBusy(form, false);
      $$('[data-toggle-password]', form).forEach((b) => {
        const inp = $('#' + b.dataset.togglePassword);
        if (inp) inp.type = 'password';
        b.textContent = 'Show';
        b.setAttribute('aria-label', 'Show password');
      });
    }

    function bindValidation(input, validate) {
      input.addEventListener('blur', () => {
        if (input.value.length || input.dataset.touched) setError(input, validate());
        input.dataset.touched = '1';
      });
      input.addEventListener('input', () => {
        const f = fieldOf(input);
        if (f && f.classList.contains('has-error')) setError(input, validate());
      });
    }

    function runChecks(checks) {
      let firstBad = null;
      checks.forEach((c) => {
        const msg = c[1]();
        setError(c[0], msg);
        if (msg && !firstBad) firstBad = c[0];
      });
      return firstBad;
    }

    function enterApp(user, message) {
      State.load(user);
      Navbar.refresh();
      Router.go('home');
      Toast.show(message, 'success');
    }

    async function onLogin(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const id = $('#loginIdentifier');
      const pw = $('#loginPassword');
      setFormError(form, '');
      const bad = runChecks([
        [id, () => validateIdentifier(id.value)],
        [pw, () => validatePassword(pw.value, false)]
      ]);
      if (bad) { bad.focus(); return; }

      setBusy(form, true);
      try {
        const res = await Auth.login({ identifier: id.value, password: pw.value });
        if (!res.ok) { setFormError(form, res.error || 'Login failed. Please try again.'); return; }
        enterApp(res.user, 'Welcome back, ' + res.user.name.split(' ')[0] + '!');
      } catch (err) {
        setFormError(form, 'Something went wrong. Please try again.');
      } finally {
        setBusy(form, false);
      }
    }

    async function onSignup(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const name = $('#signupName');
      const id = $('#signupIdentifier');
      const pw = $('#signupPassword');
      const cf = $('#signupConfirm');
      setFormError(form, '');
      const bad = runChecks([
        [name, () => validateName(name.value)],
        [id, () => validateIdentifier(id.value)],
        [pw, () => validatePassword(pw.value, true)],
        [cf, () => validateConfirm(pw.value, cf.value)]
      ]);
      if (bad) { bad.focus(); return; }

      setBusy(form, true);
      try {
        const res = await Auth.signup({ name: name.value, identifier: id.value, password: pw.value });
        if (!res.ok) {
          if (res.field === 'identifier') { setError(id, res.error); id.focus(); }
          else setFormError(form, res.error || 'Sign up failed. Please try again.');
          return;
        }
        enterApp(res.user, 'Account created. Welcome to APTITRIO!');
      } catch (err) {
        setFormError(form, 'Something went wrong. Please try again.');
      } finally {
        setBusy(form, false);
      }
    }

    function init() {
      const loginForm = $('#loginForm');
      const signupForm = $('#signupForm');

      const lid = $('#loginIdentifier');
      const lpw = $('#loginPassword');
      bindValidation(lid, () => validateIdentifier(lid.value));
      bindValidation(lpw, () => validatePassword(lpw.value, false));
      loginForm.addEventListener('submit', onLogin);

      const sn = $('#signupName');
      const sid = $('#signupIdentifier');
      const spw = $('#signupPassword');
      const scf = $('#signupConfirm');
      bindValidation(sn, () => validateName(sn.value));
      bindValidation(sid, () => validateIdentifier(sid.value));
      bindValidation(spw, () => validatePassword(spw.value, true));
      bindValidation(scf, () => validateConfirm(spw.value, scf.value));
      spw.addEventListener('input', () => { if (scf.value) setError(scf, validateConfirm(spw.value, scf.value)); });
      signupForm.addEventListener('submit', onSignup);

      $$('[data-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const inp = $('#' + btn.dataset.togglePassword);
          if (!inp) return;
          const show = inp.type === 'password';
          inp.type = show ? 'text' : 'password';
          btn.textContent = show ? 'Hide' : 'Show';
          btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
      });
    }

    return { init: init, reset: reset };
  })();

  /* ======================================================================
     12. ACTIONS (delegated clicks) — hooks for other modules
     ====================================================================== */
  const Actions = {
    continueTopic(topicId) {
      const topic = Progress.getTopic(topicId);
      if (!topic) return;
      const ev = new CustomEvent(EVENTS.CONTINUE_TOPIC, { cancelable: true, detail: { topicId: topicId, topic: topic } });
      document.dispatchEvent(ev);
      if (ev.defaultPrevented) return;
      if (Router.has('practice')) { Router.go('practice/' + topicId); return; }
      Toast.show(topic.name + ': the practice engine will connect here soon.', 'info');
    },
    continueSubject(subjectId) {
      const s = State.get();
      if (!s) return;
      const subject = s.subjects.find((x) => x.id === subjectId);
      if (!subject) return;
      const ev = new CustomEvent(EVENTS.CONTINUE_SUBJECT, { cancelable: true, detail: { subjectId: subjectId, subject: subject } });
      document.dispatchEvent(ev);
      if (ev.defaultPrevented) return;
      const next = s.topics.find((t) => t.subject === subjectId && t.unlocked && !t.completed);
      if (next) { Actions.continueTopic(next.id); return; }
      Toast.show(subject.name + ' topics will be available soon.', 'info');
    },
    logout() {
      Auth.logout();
      State.unload();
      Navbar.closeMenu();
      Router.go('login');
      Toast.show('You have been logged out.', 'info');
    },
    init() {
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        switch (el.dataset.action) {
          case 'continue-topic': Actions.continueTopic(el.dataset.topicId); break;
          case 'continue-subject': Actions.continueSubject(el.dataset.subjectId); break;
          case 'logout': Actions.logout(); break;
          default: break;
        }
      });
    }
  };

  /* ======================================================================
     13. DEV HELPERS (console only — Aptitrio.dev.loadDemoData())
     ====================================================================== */
  const dev = {
    loadDemoData() {
      if (!State.isReady()) return 'Log in first.';
      Progress.updateTopic('number-system', { progress: 65, mastery: 58, questionsCompleted: 6, currentDifficulty: 'Easy' });
      Progress.updateTopic('hcf-lcm', { progress: 30, mastery: 25, questionsCompleted: 3, currentDifficulty: 'Easy' });
      Progress.updateSubject('logical', { progress: 15, questionsCompleted: 4, currentDifficulty: 'Easy' });
      Progress.updateUser({ xp: 240, streak: 3 });
      return 'Demo data loaded.';
    },
    resetProgress() {
      const u = Auth.getCurrentUser();
      if (!u) return 'Log in first.';
      Store.remove(State.storageKey());
      State.load(u);
      Router.rerender();
      return 'Progress reset.';
    }
  };

  /* ======================================================================
     14. BOOTSTRAP
     ====================================================================== */
  let rerenderQueued = false;
  function scheduleRerender() {
    if (rerenderQueued) return;
    rerenderQueued = true;
    requestAnimationFrame(() => {
      rerenderQueued = false;
      Router.rerender();
    });
  }

  function mountLogos() {
    $$('[data-component="logo"]').forEach((el) => {
      el.innerHTML = Logo({
        size: el.dataset.size || 'md',
        inverse: el.hasAttribute('data-inverse'),
        tagline: el.hasAttribute('data-tagline')
      });
    });
  }

  function init() {
    mountLogos();
    Navbar.init();
    Forms.init();
    Actions.init();

    document.addEventListener(EVENTS.STATE_CHANGE, (e) => {
      Navbar.refresh();
      const reason = e.detail && e.detail.reason;
      if (reason === 'load' || reason === 'unload') return;
      scheduleRerender();
    });

    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key === CONFIG.keys.session) {
        const u = Auth.getCurrentUser();
        if (!u) State.unload();
        else if (!State.isReady() || State.get().user.id !== u.id) State.load(u);
        Router.resolve();
      } else if (State.isReady() && e.key === State.storageKey()) {
        State.reload();
      }
    });

    const existing = Auth.getCurrentUser();
    if (existing) State.load(existing);
    Navbar.refresh();
    Router.init();
  }

  window.Aptitrio = {
    version: '1.0.0-module1',
    config: CONFIG,
    events: EVENTS,
    levels: LEVELS,
    State: State,
    Auth: Auth,
    Router: Router,
    Progress: Progress,
    LevelStatus: LevelStatus,
    Quest: Quest,
    Components: Components,
    Toast: Toast,
    dev: dev
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();