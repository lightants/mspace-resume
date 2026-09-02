(function () {
  'use strict';

  var STORAGE_KEY = 'mspace-resume-draft-v1';
  var PHOTO_MAX_JPEG = 78000;

  var state = {
    view: 'auth',
    step: 0,
    consent: false,
    skipPhoto: false,
    photoDataUrl: '',
    photoNote: '',
    skills: [],
    surveyTools: [],
    education: [],
    experience: [],
    references: [],
    refsUponRequest: false,
    personal: {
      fullName: '',
      role: '',
      email: '',
      phone: '',
      city: '',
      linkedin: '',
      languages: 'Filipino, English',
      summary: '',
      summaryBefore: ''
    },
    survey: {
      vaInterest: '',
      hours: '',
      shift: '',
      english: '',
      rate: '',
      source: '',
      notes: ''
    }
  };

  var crop = {
    img: null,
    naturalW: 0,
    naturalH: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  var $ = function (id) { return document.getElementById(id); };

  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.personal) Object.assign(state.personal, d.personal);
      if (d.education) state.education = d.education;
      if (d.experience) state.experience = d.experience;
      if (d.references) state.references = d.references;
      if (d.skills) state.skills = d.skills;
      if (d.survey) Object.assign(state.survey, d.survey);
      if (d.surveyTools) state.surveyTools = d.surveyTools;
      state.consent = !!d.consent;
      state.skipPhoto = !!d.skipPhoto;
      state.photoDataUrl = d.photoDataUrl || '';
      state.photoNote = d.photoNote || '';
      state.refsUponRequest = !!d.refsUponRequest;
      state.step = typeof d.step === 'number' ? d.step : 0;
    } catch (e) { /* keep defaults */ }
  }

  function saveDraft() {
    readFormIntoState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        personal: state.personal,
        education: state.education,
        experience: state.experience,
        references: state.references,
        skills: state.skills,
        survey: state.survey,
        surveyTools: state.surveyTools,
        consent: state.consent,
        skipPhoto: state.skipPhoto,
        photoDataUrl: state.photoDataUrl && state.photoDataUrl.length < 200000 ? state.photoDataUrl : '',
        photoNote: state.photoNote,
        refsUponRequest: state.refsUponRequest,
        step: state.step
      }));
    } catch (e) { /* quota */ }
  }

  function readFormIntoState() {
    var map = {
      fullName: 'fullName', role: 'role', email: 'email', phone: 'phone',
      city: 'city', linkedin: 'linkedin', languages: 'languages', summary: 'summary'
    };
    Object.keys(map).forEach(function (k) {
      var el = $(k);
      if (el) state.personal[k] = el.value.trim();
    });
    var upon = $('refsUponRequest');
    if (upon) state.refsUponRequest = upon.checked;
    collectRepeaters();
  }

  function fillFormFromState() {
    Object.keys(state.personal).forEach(function (k) {
      var el = $(k);
      if (el && typeof state.personal[k] === 'string') el.value = state.personal[k];
    });
    $('consent').checked = state.consent;
    $('start-btn').disabled = !state.consent;
    $('refsUponRequest').checked = state.refsUponRequest;
    $('hours').value = state.survey.hours;
    $('english').value = state.survey.english;
    $('source').value = state.survey.source;
    $('notes').value = state.survey.notes;
    document.querySelectorAll('input[name="vaInterest"]').forEach(function (r) {
      r.checked = r.value === state.survey.vaInterest;
    });
    document.querySelectorAll('input[name="shift"]').forEach(function (r) {
      r.checked = r.value === state.survey.shift;
    });
    renderEdu();
    renderExp();
    renderRefs();
    renderSkills();
    renderToolChips();
    if (state.photoDataUrl) {
      $('crop-ui').hidden = false;
      showIdPreview(state.photoDataUrl);
    }
  }

  function currentUser() {
    return (window.MSpaceAuth && window.MSpaceAuth.currentUser) || null;
  }

  function updateChrome() {
    var user = currentUser();
    var bar = $("app-bar");
    var tabs = $("tab-bar");
    var chip = $("user-chip");
    var onAuth = state.view === "auth" || !user;
    if (bar) bar.hidden = onAuth;
    if (tabs) tabs.hidden = onAuth || state.view === "survey";
    document.body.classList.toggle("is-authed", !!user && state.view !== "auth");
    document.body.classList.toggle("has-tabs", !!(tabs && !tabs.hidden));
    if (chip) {
      if (user) { chip.hidden = false; chip.textContent = user.name || user.email || "Account"; }
      else { chip.hidden = true; chip.textContent = ""; }
    }
    var prog = $("progress");
    if (prog) prog.hidden = state.view !== "wizard";
    document.querySelectorAll("#tab-bar .tab").forEach(function (b) {
      var tab = b.getAttribute("data-tab");
      var on = false;
      if (tab === "details") on = state.view === "wizard" && state.step !== 1;
      if (tab === "photo") on = state.view === "wizard" && state.step === 1;
      if (tab === "preview") on = state.view === "resume";
      b.classList.toggle("is-on", on);
    });
  }

  function afterAuth(user) {
    if (!user) { showView("auth"); return; }
    if (!state.personal.email && user.email) {
      state.personal.email = user.email;
      var em = $("email"); if (em && !em.value) em.value = user.email;
    }
    if (!state.personal.fullName && user.name) {
      state.personal.fullName = user.name;
      var nm = $("fullName"); if (nm && !nm.value) nm.value = user.name;
    }
    if (!state.consent) showView("welcome");
    else if (state.view === "auth" || state.view === "welcome") showView("wizard");
    else showView(state.view);
  }

  function showView(name) {
    if (name !== "auth" && !currentUser()) name = "auth";
    state.view = name;
    ["auth", "welcome", "wizard", "resume", "survey"].forEach(function (v) {
      var el = $("view-" + v);
      if (el) el.classList.toggle("is-on", v === name);
    });
    if (name === "wizard") showStep(state.step);
    if (name === "resume") renderResume();
    updateChrome();
    window.scrollTo(0, 0);
  }

  function showStep(n) {
    state.step = Math.max(0, Math.min(5, n));
    document.querySelectorAll('.step').forEach(function (s) {
      s.hidden = Number(s.getAttribute('data-step')) !== state.step;
    });
    document.querySelectorAll('#progress button').forEach(function (b) {
      var i = Number(b.getAttribute('data-step'));
      b.classList.toggle('is-on', i === state.step);
      b.classList.toggle('is-done', i < state.step);
    });
    $('back-btn').textContent = state.step === 0 ? 'Back to welcome' : 'Back';
    $('next-btn').textContent = state.step === 5 ? 'Generate résumé' : 'Continue';
    saveDraft();
    if (typeof updateChrome === "function") updateChrome();
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function validPHPhone(v) {
    var s = v.replace(/[\s()-]/g, '');
    return /^(09\d{9}|\+639\d{9}|639\d{9})$/.test(s);
  }

  function validatePersonal() {
    readFormIntoState();
    var ok = true;
    ['fullName', 'role', 'email', 'phone', 'city'].forEach(function (id) {
      var el = $(id);
      if (!el.value.trim()) { el.setAttribute('aria-invalid', 'true'); ok = false; }
      else el.removeAttribute('aria-invalid');
    });
    var em = validEmail(state.personal.email);
    $('email-err').classList.toggle('is-on', !em);
    if (!em) ok = false;
    var ph = validPHPhone(state.personal.phone);
    $('phone-err').classList.toggle('is-on', !ph);
    if (!ph) ok = false;
    return ok;
  }

  /* Repeaters */
  function emptyEdu() {
    return { school: '', degree: '', years: '', honors: '' };
  }
  function emptyExp() {
    return { title: '', company: '', dates: '', bullets: '' };
  }
  function emptyRef() {
    return { name: '', role: '', org: '', contact: '' };
  }

  function collectRepeaters() {
    state.education = Array.prototype.map.call(document.querySelectorAll('#edu-list .repeat-item'), function (item) {
      return {
        school: item.querySelector('[data-k=school]').value.trim(),
        degree: item.querySelector('[data-k=degree]').value.trim(),
        years: item.querySelector('[data-k=years]').value.trim(),
        honors: item.querySelector('[data-k=honors]').value.trim()
      };
    });
    state.experience = Array.prototype.map.call(document.querySelectorAll('#exp-list .repeat-item'), function (item) {
      return {
        title: item.querySelector('[data-k=title]').value.trim(),
        company: item.querySelector('[data-k=company]').value.trim(),
        dates: item.querySelector('[data-k=dates]').value.trim(),
        bullets: item.querySelector('[data-k=bullets]').value.trim()
      };
    });
    state.references = Array.prototype.map.call(document.querySelectorAll('#ref-list .repeat-item'), function (item) {
      return {
        name: item.querySelector('[data-k=name]').value.trim(),
        role: item.querySelector('[data-k=role]').value.trim(),
        org: item.querySelector('[data-k=org]').value.trim(),
        contact: item.querySelector('[data-k=contact]').value.trim()
      };
    });
  }

  function renderEdu() {
    if (!state.education.length) state.education = [emptyEdu()];
    $('edu-list').innerHTML = state.education.map(function (e, i) {
      return '<div class="repeat-item" data-i="' + i + '">' +
        '<div class="field"><label>School</label><input data-k="school" type="text" value="' + escAttr(e.school) + '"></div>' +
        '<div class="field"><label>Degree / course</label><input data-k="degree" type="text" value="' + escAttr(e.degree) + '"></div>' +
        '<div class="grid-2"><div class="field"><label>Years</label><input data-k="years" type="text" placeholder="2019 – 2023" value="' + escAttr(e.years) + '"></div>' +
        '<div class="field"><label>Honors (optional)</label><input data-k="honors" type="text" value="' + escAttr(e.honors) + '"></div></div>' +
        '<button type="button" class="btn btn-text rm">Remove</button></div>';
    }).join('');
  }

  function renderExp() {
    if (!state.experience.length) state.experience = [emptyExp()];
    $('exp-list').innerHTML = state.experience.map(function (e, i) {
      return '<div class="repeat-item" data-i="' + i + '">' +
        '<div class="grid-2"><div class="field"><label>Title</label><input data-k="title" type="text" value="' + escAttr(e.title) + '"></div>' +
        '<div class="field"><label>Company / client</label><input data-k="company" type="text" value="' + escAttr(e.company) + '"></div></div>' +
        '<div class="field"><label>Dates</label><input data-k="dates" type="text" placeholder="Jan 2024 – Present" value="' + escAttr(e.dates) + '"></div>' +
        '<div class="field"><label>Highlights (one per line, 2–4 bullets)</label><textarea data-k="bullets" rows="4">' + esc(e.bullets) + '</textarea></div>' +
        '<button type="button" class="btn btn-text rm">Remove</button></div>';
    }).join('');
  }

  function renderRefs() {
    if (!state.references.length) state.references = [emptyRef(), emptyRef()];
    $('ref-list').innerHTML = state.references.map(function (e) {
      return '<div class="repeat-item">' +
        '<div class="grid-2"><div class="field"><label>Name</label><input data-k="name" type="text" value="' + escAttr(e.name) + '"></div>' +
        '<div class="field"><label>Role</label><input data-k="role" type="text" value="' + escAttr(e.role) + '"></div></div>' +
        '<div class="grid-2"><div class="field"><label>Organization</label><input data-k="org" type="text" value="' + escAttr(e.org) + '"></div>' +
        '<div class="field"><label>Phone or email</label><input data-k="contact" type="text" value="' + escAttr(e.contact) + '"></div></div>' +
        '<button type="button" class="btn btn-text rm">Remove</button></div>';
    }).join('');
  }

  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }

  function renderSkills() {
    $('skill-list').innerHTML = state.skills.map(function (s) {
      return '<button type="button" class="chip is-on" data-remove="' + escAttr(s) + '">' + esc(s) + ' ×</button>';
    }).join('');
    document.querySelectorAll('#skill-suggestions .chip').forEach(function (c) {
      c.classList.toggle('is-on', state.skills.indexOf(c.getAttribute('data-skill')) !== -1);
    });
  }

  function addSkill(s) {
    s = s.trim();
    if (!s) return;
    if (state.skills.indexOf(s) === -1) state.skills.push(s);
    renderSkills();
    saveDraft();
  }

  function renderToolChips() {
    document.querySelectorAll('#tool-chips .chip').forEach(function (c) {
      c.classList.toggle('is-on', state.surveyTools.indexOf(c.getAttribute('data-tool')) !== -1);
    });
  }

  /* Photo crop: drag + zoom, output 600x600 white canvas */
  function applyCropTransform() {
    var img = $('crop-img');
    if (!img || !crop.img) return;
    var stage = $('crop-stage');
    var size = stage.clientWidth || 360;
    var base = Math.max(size / crop.naturalW, size / crop.naturalH);
    var scale = base * crop.zoom;
    var w = crop.naturalW * scale;
    var h = crop.naturalH * scale;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.transform = 'translate(-50%, -50%) translate(' + crop.panX + 'px,' + crop.panY + 'px)';
  }

  function bakePhoto() {
    if (!crop.img) return;
    var OUT = 600;
    var stage = $('crop-stage');
    var size = stage.clientWidth || 360;
    var base = Math.max(size / crop.naturalW, size / crop.naturalH);
    var scale = base * crop.zoom;
    var canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT, OUT);
    var ratio = OUT / size;
    var w = crop.naturalW * scale * ratio;
    var h = crop.naturalH * scale * ratio;
    var x = (OUT - w) / 2 + crop.panX * ratio;
    var y = (OUT - h) / 2 + crop.panY * ratio;
    ctx.drawImage(crop.img, x, y, w, h);
    state.photoDataUrl = canvas.toDataURL('image/png');
    state.photoOriginalDataUrl = state.photoDataUrl;
    state.photoNote = '2x2 PNG generated on device (600x600)';
    state.skipPhoto = false;
    showIdPreview(state.photoDataUrl);
    saveDraft();
  }



  function showIdPreview(url) {
    var slot = $('id-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (slot.tagName === 'IMG') {
      slot.src = url;
    } else {
      var img = document.createElement('img');
      img.src = url;
      img.alt = '2×2 formal photo';
      img.width = 160;
      img.height = 160;
      img.style.width = '160px';
      img.style.height = '160px';
      img.style.objectFit = 'cover';
      slot.appendChild(img);
    }
    $('dl-2x2').hidden = false;
  }

  function compressJpeg(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var q = 0.72;
      var size = 480;
      function tryOnce() {
        var c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        var out = c.toDataURL('image/jpeg', q);
        if (out.length > PHOTO_MAX_JPEG && (q > 0.4 || size > 280)) {
          if (q > 0.4) q -= 0.1;
          else size = Math.floor(size * 0.85);
          tryOnce();
        } else if (out.length > PHOTO_MAX_JPEG) {
          cb('');
        } else {
          cb(out);
        }
      }
      tryOnce();
    };
    img.src = dataUrl;
  }

  /* Heuristic rewriter — no API */
  function yearsFromExperience() {
    var text = state.experience.map(function (e) { return e.dates + ' ' + e.bullets; }).join(' ');
    var years = text.match(/\b(20\d{2})\b/g);
    if (!years || years.length < 2) {
      if (/\d+\s*\+?\s*years?/i.test(text) || /\d+\s*\+?\s*years?/i.test(state.personal.summary)) {
        var m = (text + ' ' + state.personal.summary).match(/(\d+)\s*\+?\s*years?/i);
        return m ? m[1] + '+' : '';
      }
      return '';
    }
    years = years.map(Number);
    var span = Math.max.apply(null, years) - Math.min.apply(null, years);
    return span >= 1 ? String(span) : '';
  }

  function polishSummary(raw, personal, skills, education, experience) {
    var role = (personal.role || 'virtual assistant').trim();
    var city = (personal.city || 'the Philippines').trim();
    var langs = (personal.languages || 'Filipino and English').trim();
    var skillList = skills.length ? skills.slice(0, 6).join(', ') : 'Google Workspace, email, and customer support';
    var eduBit = '';
    var ed = education.filter(function (e) { return e.school || e.degree; })[0];
    if (ed) {
      eduBit = ed.degree && ed.school
        ? ' Formal studies include ' + ed.degree + ' at ' + ed.school + '.'
        : ' Education: ' + (ed.degree || ed.school) + '.';
    }
    var y = yearsFromExperience();
    var tenure = y
      ? 'With about ' + y + ' years of relevant work and freelance experience, '
      : 'Ready to contribute from day one, ';
    var draft = (raw || '').replace(/\s+/g, ' ').trim();
    var want = draft
      ? rewriteSentences(draft, role)
      : 'Seeking a ' + role + ' role supporting a remote team with reliable, same-day follow-through.';

    var s1 = want;
    if (!/virtual assistant|va\b|assistant|support/i.test(s1) && /va|assistant/i.test(role)) {
      s1 = 'Professional ' + role + ' based in ' + city + ', focused on keeping inboxes, calendars, and client requests moving.';
    }
    var s2 = tenure + 'I work comfortably with ' + skillList + '.';
    var s3 = 'I communicate in ' + langs + ' and keep a calm, organized tone with clients and teammates.';
    var s4 = 'Open to VA and office applications where clear documentation, polite follow-up, and on-time delivery matter.' + eduBit;
    return [s1, s2, s3, s4].join(' ').replace(/\s+/g, ' ').trim();
  }

  function rewriteSentences(text, role) {
    var t = text
      .replace(/\bI am looking for\b/gi, 'Seeking')
      .replace(/\bI want to\b/gi, 'Aiming to')
      .replace(/\bhardworking\b/gi, 'dependable')
      .replace(/\bteam player\b/gi, 'collaborative teammate')
      .replace(/\bgo-getter\b/gi, 'self-starter')
      .replace(/\bpassionate about\b/gi, 'focused on')
      .replace(/\bleverage\b/gi, 'use')
      .replace(/\bsynergy\b/gi, 'teamwork')
      .replace(/\butilize\b/gi, 'use');
    if (t.length < 40) {
      return 'Seeking a ' + role + ' position. ' + t;
    }
    if (!/^[A-Z]/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) t += '.';
    return t;
  }

  /* Resume HTML */
  function renderResume() {
    readFormIntoState();
    var p = state.personal;
    var photo = state.photoDataUrl && !state.skipPhoto
      ? '<img class="resume-photo" src="' + state.photoDataUrl + '" alt="2×2 formal photo" width="106" height="106">'
      : '<div class="resume-photo" style="display:grid;place-items:center;font-size:8pt;color:#999;text-align:center;padding:2mm">2×2<br>photo</div>';
    var contact = [p.email, p.phone, p.city, p.linkedin, p.languages].filter(Boolean).join(' · ');
    var expHtml = state.experience.filter(function (e) { return e.title || e.company; }).map(function (e) {
      var bullets = (e.bullets || '').split('\n').map(function (b) { return b.replace(/^[\s•\-]+/, '').trim(); }).filter(Boolean);
      var lis = bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('');
      return '<div class="resume-job"><strong>' + esc(e.title || 'Role') + '</strong>' +
        '<div class="when">' + esc([e.company, e.dates].filter(Boolean).join(' · ')) + '</div>' +
        (lis ? '<ul>' + lis + '</ul>' : '') + '</div>';
    }).join('') || '<p>Experience to be added.</p>';
    var eduHtml = state.education.filter(function (e) { return e.school || e.degree; }).map(function (e) {
      return '<div class="resume-job"><strong>' + esc(e.degree || e.school) + '</strong>' +
        '<div class="when">' + esc([e.school, e.years, e.honors].filter(Boolean).join(' · ')) + '</div></div>';
    }).join('') || '<p>—</p>';
    var skills = state.skills.length ? '<p>' + esc(state.skills.join(' · ')) + '</p>' : '<p>—</p>';
    var refs;
    if (state.refsUponRequest) {
      refs = '<p>Available upon request.</p>';
    } else {
      var filled = state.references.filter(function (r) { return r.name; });
      refs = filled.length
        ? filled.map(function (r) {
          return '<p><strong>' + esc(r.name) + '</strong> — ' +
            esc([r.role, r.org].filter(Boolean).join(', ')) +
            (r.contact ? ' · ' + esc(r.contact) : '') + '</p>';
        }).join('')
        : '<p>Available upon request.</p>';
    }
    $('resume-sheet').innerHTML =
      '<div class="resume-top">' + photo +
      '<div><h1 class="resume-name">' + esc(p.fullName || 'Your name') + '</h1>' +
      '<p class="resume-role">' + esc(p.role || 'Desired role') + '</p>' +
      '<p class="resume-meta">' + esc(contact) + '</p></div></div>' +
      '<h3>Objective</h3><p>' + esc(p.summary || 'Professional summary will appear here.') + '</p>' +
      '<h3>Experience</h3>' + expHtml +
      '<h3>Education</h3>' + eduHtml +
      '<h3>Skills</h3>' + skills +
      '<h3>References</h3>' + refs;
  }

  function downloadPdf() {
    var sheet = $('resume-sheet');
    var h2c = window.html2canvas;
    var JSPDF = window.jspdf && window.jspdf.jsPDF;
    if (!h2c || !JSPDF) {
      window.print();
      return;
    }
    h2c(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function (canvas) {
      var img = canvas.toDataURL('image/jpeg', 0.92);
      var pdf = new JSPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      var pageW = 210;
      var pageH = 297;
      var imgW = pageW;
      var imgH = canvas.height * pageW / canvas.width;
      if (imgH > pageH) {
        pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH);
      } else {
        pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH);
      }
      var name = (state.personal.fullName || 'resume').replace(/[^\w\-]+/g, '_');
      pdf.save(name + '_MSpace_Resume.pdf');
    }).catch(function () {
      window.print();
    });
  }

  function payload(photoField) {
    readFormIntoState();
    readSurveyIntoState();
    return {
      Timestamp: new Date().toISOString(),
      Name: state.personal.fullName,
      Role: state.personal.role,
      Email: state.personal.email,
      Phone: state.personal.phone,
      City: state.personal.city,
      LinkedIn: state.personal.linkedin,
      Languages: state.personal.languages,
      Summary: state.personal.summary,
      Education: JSON.stringify(state.education),
      Experience: JSON.stringify(state.experience),
      Skills: state.skills.join(', '),
      References: state.refsUponRequest ? 'Available upon request' : JSON.stringify(state.references),
      Status: 'New',
      AccountEmail: (currentUser() && currentUser().email) || '',
      DesiredRole: state.personal.role,
      PhotoNote: photoField || state.photoNote || (state.skipPhoto ? 'skipped' : 'photo attached locally'),
      VAInterest: state.survey.vaInterest,
      HoursAvailable: state.survey.hours,
      PreferredShift: state.survey.shift,
      Tools: state.surveyTools.join(', '),
      English: state.survey.english,
      HeardAboutMSpace: state.survey.source,
      Notes: state.survey.notes,
      Consent: state.consent ? 'yes' : 'no',
      Channel: 'MSpace Resume Builder'
    };
  }

  function readSurveyIntoState() {
    if ($('hours')) state.survey.hours = $('hours').value.trim();
    if ($('english')) state.survey.english = $('english').value;
    if ($('source')) state.survey.source = $('source').value.trim();
    if ($('notes')) state.survey.notes = $('notes').value.trim();
    var va = document.querySelector('#survey-form input[name="vaInterest"]:checked');
    var sh = document.querySelector('#survey-form input[name="shift"]:checked');
    state.survey.vaInterest = va ? va.value : '';
    state.survey.shift = sh ? sh.value : '';
  }

  function submitToMSpace() {
    var status = $('submit-status');
    readSurveyIntoState();
    if (!state.consent) {
      status.hidden = false;
      status.className = 'status warn';
      status.textContent = 'Consent is required before sending to MSpace.';
      return;
    }
    if (!state.survey.vaInterest || !state.survey.hours || !state.survey.shift || !state.survey.english) {
      status.hidden = false;
      status.className = 'status warn';
      var missing = [];
      if (!state.survey.vaInterest) missing.push('VA interest');
      if (!state.survey.hours) missing.push('hours');
      if (!state.survey.shift) missing.push('shift');
      if (!state.survey.english) missing.push('English');
      status.textContent = 'Still needed: ' + missing.join(', ') + '.';
      return;
    }
    var url = (window.MSPACE_SHEETS_WEBHOOK || '').trim();
    if (!url) {
      saveDraft();
      status.hidden = false;
      status.className = 'status warn';
      status.textContent = 'Saved on this device. Sheet inbox not connected yet.';
      return;
    }

    function post(body) {
      status.hidden = false;
      status.className = 'status';
      status.textContent = 'Sending…';
      saveDraft();
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text().then(function (txt) {
          try { return JSON.parse(txt); } catch (e) { return { ok: true }; }
        });
      }).then(function (data) {
        if (data && data.ok === false) throw new Error(data.error || 'inbox error');
        status.className = 'status ok';
        status.textContent = 'Sent to MSpace inbox. Keep a PDF copy of your résumé on this device.';
      }).catch(function () {
        status.className = 'status warn';
        status.textContent = 'Could not confirm a Sheets write from this browser. Your résumé is saved on this device. After the web app is deployed, check the Leads tab — this screen never marks a send as successful unless the inbox responds.';
      });
    }

    if (state.photoDataUrl && !state.skipPhoto) {
      compressJpeg(state.photoDataUrl, function (small) {
        var body = payload(small ? small : 'photo attached locally');
        post(body);
      });
    } else {
      post(payload(state.skipPhoto ? 'skipped' : 'photo attached locally'));
    }
  }

  /* Events */
  function bind() {
    $('consent').addEventListener('change', function () {
      state.consent = this.checked;
      $('start-btn').disabled = !this.checked;
      saveDraft();
    });
    $('start-btn').addEventListener('click', function () {
      if (!state.consent) return;
      showView('wizard');
    });
    $('brand-home').addEventListener('click', function (e) {
      e.preventDefault();
      if (!currentUser()) showView('auth');
      else if (!state.consent) showView('welcome');
      else showView('wizard');
    });
    $('back-btn').addEventListener('click', function () {
      readFormIntoState();
      if (state.step === 0) showView('welcome');
      else showStep(state.step - 1);
    });
    $('next-btn').addEventListener('click', function () {
      if (state.step === 0 && !validatePersonal()) return;
      readFormIntoState();
      if (state.step === 5) {
        if (!state.consent) {
          showView('welcome');
          return;
        }
        showView('resume');
        return;
      }
      showStep(state.step + 1);
    });
    document.querySelectorAll('#progress button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.step === 0 && Number(b.getAttribute('data-step')) > 0 && !validatePersonal()) return;
        readFormIntoState();
        showStep(Number(b.getAttribute('data-step')));
      });
    });

    $('add-edu').addEventListener('click', function () {
      collectRepeaters();
      state.education.push(emptyEdu());
      renderEdu();
    });
    $('add-exp').addEventListener('click', function () {
      collectRepeaters();
      state.experience.push(emptyExp());
      renderExp();
    });
    $('add-ref').addEventListener('click', function () {
      collectRepeaters();
      if (state.references.length >= 3) return;
      state.references.push(emptyRef());
      renderRefs();
    });
    ['edu-list', 'exp-list', 'ref-list'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        if (!e.target.classList.contains('rm')) return;
        collectRepeaters();
        var item = e.target.closest('.repeat-item');
        var list = item.parentNode;
        var idx = Array.prototype.indexOf.call(list.children, item);
        if (id === 'edu-list') { state.education.splice(idx, 1); renderEdu(); }
        if (id === 'exp-list') { state.experience.splice(idx, 1); renderExp(); }
        if (id === 'ref-list') { state.references.splice(idx, 1); renderRefs(); }
        saveDraft();
      });
    });

    $('skill-suggestions').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-skill]');
      if (!chip) return;
      addSkill(chip.getAttribute('data-skill'));
    });
    $('skill-list').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-remove]');
      if (!chip) return;
      state.skills = state.skills.filter(function (s) { return s !== chip.getAttribute('data-remove'); });
      renderSkills();
      saveDraft();
    });
    $('skill-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSkill(this.value);
        this.value = '';
      }
    });

    $('tool-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-tool]');
      if (!chip) return;
      var t = chip.getAttribute('data-tool');
      var i = state.surveyTools.indexOf(t);
      if (i === -1) state.surveyTools.push(t);
      else state.surveyTools.splice(i, 1);
      renderToolChips();
      saveDraft();
    });

    $('polish-btn').addEventListener('click', function () {
      readFormIntoState();
      var before = state.personal.summary;
      var after = polishSummary(before, state.personal, state.skills, state.education, state.experience);
      state.personal.summaryBefore = before;
      state.personal.summary = after;
      $('summary').value = after;
      $('polish-before').textContent = before || '(empty)';
      $('polish-after').textContent = after;
      $('polish-box').hidden = false;
      saveDraft();
    });

    function loadPhotoFile(file) {
      if (!file) return;
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        crop.img = img;
        crop.naturalW = img.naturalWidth;
        crop.naturalH = img.naturalHeight;
        crop.zoom = 1;
        crop.panX = 0;
        crop.panY = 0;
        $('crop-img').src = url;
        $('crop-ui').hidden = false;
        $('zoom').value = 100;
        applyCropTransform();
      };
      img.src = url;
    }
    var selfieStream = null;
    var facingMode = 'user';
    function stopSelfie() {
      if (selfieStream) {
        selfieStream.getTracks().forEach(function (tr) { tr.stop(); });
        selfieStream = null;
      }
      var live = $('selfie-live');
      if (live) live.hidden = true;
    }
    function startCamera() {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        if (selfieFile) selfieFile.click();
        return;
      }
      var video = $('selfie-video');
      var constraints = { video: { facingMode: { ideal: facingMode }, width: { ideal: 720 }, height: { ideal: 720 } }, audio: false };
      navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
        if (selfieStream) selfieStream.getTracks().forEach(function (tr) { tr.stop(); });
        selfieStream = stream;
        $('selfie-live').hidden = false;
        video.srcObject = stream;
        video.classList.add('is-mirror');
        video.play && video.play();
      }).catch(function () {
        if (selfieFile) selfieFile.click();
      });
    }
    $('photoFile').addEventListener('change', function () {
      loadPhotoFile(this.files && this.files[0]);
    });
    var selfieFile = $('photoSelfie');
    if (selfieFile) selfieFile.addEventListener('change', function () {
      loadPhotoFile(this.files && this.files[0]);
    });
    var selfieBtn = $('selfie-btn');
    if (selfieBtn) selfieBtn.addEventListener('click', function () {
      facingMode = 'user';
      startCamera();
    });
    var snap = $('selfie-snap');
    if (snap) snap.addEventListener('click', function () {
      var video = $('selfie-video');
      if (!video || !video.videoWidth) return;
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      stopSelfie();
      canvas.toBlob(function (blob) {
        if (!blob) return;
        loadPhotoFile(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.92);
    });
    var cancelCam = $('selfie-cancel');
    if (cancelCam) cancelCam.addEventListener('click', stopSelfie);
    function flipCropHorizontal() {
      var src = crop.img || $('crop-img');
      if (!src || !src.naturalWidth && !crop.naturalW) return;
      var w = crop.naturalW || src.naturalWidth;
      var h = crop.naturalH || src.naturalHeight;
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, w, h);
      var url = canvas.toDataURL('image/jpeg', 0.92);
      var img = new Image();
      img.onload = function () {
        crop.img = img;
        crop.naturalW = img.naturalWidth;
        crop.naturalH = img.naturalHeight;
        $('crop-img').src = url;
        applyCropTransform();
      };
      img.src = url;
      if (state.photoDataUrl) {
        var p = new Image();
        p.onload = function () {
          var c2 = document.createElement('canvas');
          c2.width = p.naturalWidth;
          c2.height = p.naturalHeight;
          var g = c2.getContext('2d');
          g.translate(c2.width, 0);
          g.scale(-1, 1);
          g.drawImage(p, 0, 0);
          state.photoDataUrl = c2.toDataURL('image/png');
          state.photoOriginalDataUrl = state.photoDataUrl;
          showIdPreview(state.photoDataUrl);
          saveDraft();
        };
        p.src = state.photoDataUrl;
      }
    }

    $('zoom').addEventListener('input', function () {
      crop.zoom = Number(this.value) / 100;
      applyCropTransform();
    });
    var stage = $('crop-stage');
    stage.addEventListener('pointerdown', function (e) {
      crop.dragging = true;
      crop.lastX = e.clientX;
      crop.lastY = e.clientY;
      stage.classList.add('is-drag');
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!crop.dragging) return;
      crop.panX += e.clientX - crop.lastX;
      crop.panY += e.clientY - crop.lastY;
      crop.lastX = e.clientX;
      crop.lastY = e.clientY;
      applyCropTransform();
    });
    stage.addEventListener('pointerup', function () {
      crop.dragging = false;
      stage.classList.remove('is-drag');
    });
    stage.addEventListener('pointercancel', function () {
      crop.dragging = false;
    });
    $('apply-crop').addEventListener('click', bakePhoto);
    $('skip-photo').addEventListener('click', function () {
      state.skipPhoto = true;
      state.photoNote = 'skipped';
      saveDraft();
      showStep(2);
    });
    $('dl-2x2').addEventListener('click', function () {
      if (!state.photoDataUrl) return;
      var a = document.createElement('a');
      a.href = state.photoDataUrl;
      a.download = 'mspace-2x2.png';
      a.click();
    });

    $('print-btn').addEventListener('click', function () { window.print(); });
    $('pdf-btn').addEventListener('click', downloadPdf);
    $('edit-btn').addEventListener('click', function () { showView('wizard'); });
    $('to-survey-btn').addEventListener('click', function () { showView('survey'); });
    $('survey-back').addEventListener('click', function () { showView('resume'); });
    $('survey-form').addEventListener('submit', function (e) {
      e.preventDefault();
      submitToMSpace();
    });

    var tabBar = $("tab-bar");
    if (tabBar) tabBar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab]");
      if (!b || !currentUser() || !state.consent) return;
      var tab = b.getAttribute("data-tab");
      if (tab === "details") { if (state.step === 1) state.step = 0; showView("wizard"); }
      if (tab === "photo") { state.step = 1; showView("wizard"); }
      if (tab === "preview") showView("resume");
    });

    ['wizard-form', 'survey-form'].forEach(function (id) {
      $(id).addEventListener('change', saveDraft);
      $(id).addEventListener('input', function () {
        clearTimeout(bind._t);
        bind._t = setTimeout(saveDraft, 400);
      });
    });
  }

  document.addEventListener('mspace-auth-change', function (e) {
    afterAuth(e.detail);
  });
  loadDraft();
  bind();
  fillFormFromState();
  afterAuth(currentUser());
})();
