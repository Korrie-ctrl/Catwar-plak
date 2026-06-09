// ==UserScript==
// @name         CatWar Admin Helper: Бронь + Таймеры + Шаблоны + Теги
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Объединенный скрипт: кнопки брони (с фиксом), таймеры, шаблоны ответов и система тегов/заметок
// @author       Берсерк + Мыша + Панк-Рок (Слияние)
// @match        https://catwar.net/*
// @match        https://catwar.su/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    const path = window.location.pathname;

    // === БЛОК 1: ПАРСИНГ ДАННЫХ ПОЛЬЗОВАТЕЛЯ (НА ГЛАВНОЙ) ===
    if (path === '/' || path === '/index') {
        const nameEl = document.querySelector('#pr big');
        const idEl = document.querySelector('#id_val');
        
        if (nameEl && idEl) {
            localStorage.setItem('cw_mod_name', nameEl.innerText.trim());
            localStorage.setItem('cw_mod_id', idEl.innerText.trim());
        }
        return; 
    }

    // === БЛОК 2: ФУНКЦИОНАЛ БРОНИ И ТАЙМЕРОВ (только для /plak) ===
    if (path.startsWith('/plak')) {
        const DB_URL = 'https://catwar-plak-default-rtdb.europe-west1.firebasedatabase.app/claims.json'; 

        // --- 2.1 Отображение забронированных и времени (от Мыши) ---
        function parseBookingTime(timeStr) {
            const now = new Date();
            const mskOffset = 3;
            const localOffset = -now.getTimezoneOffset() / 60;
            const offsetDiff = mskOffset - localOffset;
            const mskNow = new Date(now.getTime() + offsetDiff * 60 * 60 * 1000);
            const currentYear = mskNow.getFullYear();
            const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

            let dateMatch = timeStr.match(/(\d+)\s+([а-я]+)\s+(\d{4})\s+[в]\s+(\d+):(\d+)/i);
            if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                const monthName = dateMatch[2];
                const year = parseInt(dateMatch[3]);
                const hour = parseInt(dateMatch[4]);
                const minute = parseInt(dateMatch[5]);
                const monthIndex = monthNames.findIndex(m => monthName.includes(m));

                if (monthIndex !== -1) {
                    const bookedDate = new Date(year, monthIndex, day, hour, minute, 0, 0);
                    return Math.max(0, Math.floor((mskNow - bookedDate) / (1000 * 60)));
                }
            }

            dateMatch = timeStr.match(/(\d+)\s+([а-я]+)\s+[в]\s+(\d+):(\d+)/i);
            if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                const monthName = dateMatch[2];
                const hour = parseInt(dateMatch[3]);
                const minute = parseInt(dateMatch[4]);
                const monthIndex = monthNames.findIndex(m => monthName.includes(m));

                if (monthIndex !== -1) {
                    let bookedDate = new Date(currentYear, monthIndex, day, hour, minute, 0, 0);
                    let diffMinutes = Math.floor((mskNow - bookedDate) / (1000 * 60));
                    if (diffMinutes < 0) {
                        bookedDate = new Date(currentYear - 1, monthIndex, day, hour, minute, 0, 0);
                        diffMinutes = Math.floor((mskNow - bookedDate) / (1000 * 60));
                    }
                    return Math.max(0, diffMinutes);
                }
            }

            if (timeStr.includes('сегодня')) {
                const timeMatch = timeStr.match(/(\d+):(\d+)/);
                if (timeMatch) {
                    let bookedDate = new Date(mskNow);
                    bookedDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                    if (bookedDate > mskNow) bookedDate.setDate(bookedDate.getDate() - 1);
                    return Math.floor((mskNow - bookedDate) / (1000 * 60));
                }
            }

            if (timeStr.includes('вчера')) {
                const timeMatch = timeStr.match(/(\d+):(\d+)/);
                if (timeMatch) {
                    let bookedDate = new Date(mskNow);
                    bookedDate.setDate(mskNow.getDate() - 1);
                    bookedDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                    return Math.floor((mskNow - bookedDate) / (1000 * 60));
                }
            }

            const minuteMatch = timeStr.match(/(\d+)\s*минут/);
            if (minuteMatch) return parseInt(minuteMatch[1]);
            const hourMatch = timeStr.match(/(\d+)\s*час/);
            if (hourMatch) return parseInt(hourMatch[1]) * 60;

            return 0;
        }

        function getAgeCategory(minutes) {
            if (minutes < 60) return 'менее часа';
            if (minutes < 120) return '1 час';
            if (minutes < 180) return '2 часа';
            if (minutes < 1440) {
                const hours = Math.floor(minutes / 60);
                if (hours % 10 === 1 && hours % 100 !== 11) return `${hours} час`;
                if ([2, 3, 4].includes(hours % 10) && ![12, 13, 14].includes(hours % 100)) return `${hours} часа`;
                return `${hours} часов`;
            }
            const days = Math.floor(minutes / 1440);
            if (days % 10 === 1 && days % 100 !== 11) return `${days} день`;
            if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return `${days} дня`;
            return `${days} дней`;
        }

        function processBookedMessages() {
            document.querySelectorAll('.p_toggle').forEach(toggle => {
                const parentDiv = toggle.closest('div');
                if (!parentDiv) return;
                const messagesDiv = parentDiv.querySelector('.messages');
                if (!messagesDiv) return;

                if (messagesDiv.innerText.includes('Забронировал')) {
                    toggle.style.backgroundColor = 'rgba(255, 255, 102, 0.18)';
                    if (toggle.querySelector('.booked-marker')) return;

                    const marker = document.createElement('span');
                    marker.className = 'booked-marker';
                    marker.style.cssText = 'display:inline-block;width:10px;height:10px;background-color:#000;margin-right:8px;border-radius:2px;flex-shrink:0;cursor:pointer;';

                    let bookingInfo = '', bookingTime = '', totalMinutes = 0;
                    const bookingMatch = messagesDiv.innerHTML.match(/Забронировал\(а\)\s+<a\s+href="\/cat\d+">([^<]+)<\/a>\s+([^<|]+?)(?:\s*[|<]|\s*$)/);

                    if (bookingMatch && bookingMatch[1] && bookingMatch[2]) {
                        bookingInfo = bookingMatch[1];
                        bookingTime = bookingMatch[2].trim();
                        totalMinutes = parseBookingTime(bookingTime);
                    } else {
                        const plainMatch = messagesDiv.innerText.match(/Забронировал\(а\)\s+([^\s]+)\s+(.+?)(?:\s*[|<]|\s*$)/);
                        if (plainMatch && plainMatch[1]) {
                            bookingInfo = plainMatch[1];
                            bookingTime = plainMatch[2] ? plainMatch[2].trim() : '';
                            totalMinutes = parseBookingTime(bookingTime);
                        }
                    }

                    const ageCategory = getAgeCategory(totalMinutes);
                    marker.title = bookingInfo ? `Забронировано: ${bookingInfo}\nВремя: ${bookingTime}\nВисит бронь: ${ageCategory}` : 'Забронировано';

                    if (totalMinutes >= 120) {
                        const ageSpan = document.createElement('span');
                        ageSpan.className = 'booking-age';
                        ageSpan.style.cssText = 'font-size:11px;font-weight:bold;margin-left:8px;color:#ff4444;';
                        ageSpan.textContent = `(${ageCategory})`;
                        toggle.appendChild(ageSpan);
                    }

                    const firstBold = toggle.querySelector('b');
                    if (firstBold) firstBold.insertBefore(marker, firstBold.firstChild);
                }
            });
        }

        // --- 2.2 Функционал кнопок Занять/Освободить (от Берсерка) ---
        const myId = localStorage.getItem('cw_mod_id');
        const myName = localStorage.getItem('cw_mod_name');
        let claimsDb = {}; 

        function fetchClaims() {
            if(!myId) return;
            GM_xmlhttpRequest({
                method: "GET", url: DB_URL,
                onload: function(response) {
                    if (response.status === 200) {
                        claimsDb = JSON.parse(response.responseText) || {};
                        updateUI();
                    }
                }
            });
        }

        function saveClaim(ticketId) {
            claimsDb[ticketId] = { id: myId, name: myName, timestamp: Date.now() };
            updateUI(); syncWithServer();
        }

        function removeClaim(ticketId) {
            delete claimsDb[ticketId];
            updateUI(); syncWithServer();
        }

        function syncWithServer() {
            GM_xmlhttpRequest({ method: "PUT", url: DB_URL, data: JSON.stringify(claimsDb) });
        }

        function updateUI() {
            document.querySelectorAll('a.ignor[href^="plak?cat="]').forEach(btn => {
                const url = new URL(btn.href, window.location.origin);
                const ticketId = url.searchParams.get('cat');
                if (!ticketId) return;

                const pContainer = btn.closest('p');
                const messagesDiv = btn.closest('.messages');
                if (!messagesDiv) return;
                const headerP = messagesDiv.previousElementSibling; 
                if (!headerP) return;
                const linkEl = headerP.querySelector('b a'); 

                let actionSpan = pContainer.querySelector('.cw-action-span');
                if (!actionSpan) {
                    actionSpan = document.createElement('span');
                    actionSpan.className = 'cw-action-span';
                    pContainer.append(document.createTextNode(' | '), actionSpan);
                }
                actionSpan.innerHTML = ''; 

                const oldLabel = headerP.querySelector('.claimer-label');
                if (oldLabel) oldLabel.remove();

                if (claimsDb[ticketId]) {
                    const claimer = claimsDb[ticketId];
                    const label = document.createElement('span');
                    label.className = 'claimer-label';
                    label.style.fontWeight = 'bold';
                    label.innerText = ` [Занял(а): ${claimer.name}]`;
                    headerP.appendChild(label);

                    if (linkEl) linkEl.style.color = '#000000';

                    if (claimer.id === myId) {
                        headerP.style.backgroundColor = '#d4edda';
                        headerP.style.border = '1px solid #c3e6cb';
                        headerP.style.color = '#155724';
                        
                        const unclaimBtn = document.createElement('a');
                        unclaimBtn.href = '#'; 
                        unclaimBtn.innerText = 'Освободить';
                        unclaimBtn.style.color = '#dc3545';
                        unclaimBtn.style.fontWeight = 'bold';
                        unclaimBtn.onclick = (e) => { e.preventDefault(); removeClaim(ticketId); };
                        actionSpan.appendChild(unclaimBtn);
                    } else {
                        headerP.style.backgroundColor = '#fdf5e6';
                        headerP.style.border = '1px solid #faebd7';
                        headerP.style.color = '#8b4513';
                    }
                } else {
                    headerP.style.border = ''; 
                    headerP.style.color = '';
                    if (linkEl) linkEl.style.color = ''; 
                    
                    if (messagesDiv.innerText.includes('Забронировал')) {
                        headerP.style.backgroundColor = 'rgba(255, 255, 102, 0.18)';
                    } else {
                        headerP.style.backgroundColor = '';
                    }
                    
                    const claimBtn = document.createElement('a');
                    claimBtn.href = '#'; 
                    claimBtn.innerText = 'Занять';
                    claimBtn.style.color = '#28a745';
                    claimBtn.style.fontWeight = 'bold';
                    claimBtn.onclick = (e) => { e.preventDefault(); saveClaim(ticketId); };
                    actionSpan.appendChild(claimBtn);
                }
            });
        }

        // Исправление: Бронь снимается при ответе ЛЮБОГО модератора
        document.addEventListener('submit', function(event) {
            const form = event.target;
            if (form && form.tagName === 'FORM') {
                const catInput = form.querySelector('input[name="cat"]');
                if (catInput && catInput.value && claimsDb[catInput.value]) {
                    removeClaim(catInput.value);
                }
            }
        });

        // Запуск модулей бронирования
        processBookedMessages();
        const plakObserver = new MutationObserver(function() {
            processBookedMessages();
        });
        plakObserver.observe(document.body, { childList: true, subtree: true });

        if (myId) {
            fetchClaims(); 
            setInterval(fetchClaims, 30000); 
        }
    }

    // === БЛОК 3: ШАБЛОНЫ ОТВЕТОВ (для /plak, /saint_rabbit, /support) ===
    if (path.startsWith('/plak') || path.startsWith('/saint_rabbit') || path.startsWith('/support')) {
        const templates = {
            "Налог": `Здравствуйте,\n\nСожалею, но для оказания данной услуги Вам необходимо оплатить [url=https://catwar.net/rabbit_universe_new]налог за локации[/url]. Если эта функция недоступна на данный момент, подождите 2-3 дня.\n\nС уважением, Святой Кроль`,
            "К Почтовику": `Здравствуйте,\n\nВопросы, касающиеся нарушения общих правил игры (ОПИ), рассматривает [url=https://catwar.net/cat7272]Почтовик[/url]. Обратитесь, пожалуйста, к нему.\n\nС уважением, Святой Кроль`,
            "Мошенничество": `Здравствуйте,\n\nВопросы, касающиеся мошенничества (ОПИ3.6), включая случаи с участием кролей, рассматривает [url=https://catwar.net/cat7272]Почтовик[/url]. Обратитесь, пожалуйста, к нему.\n\nС уважением, Святой Кроль`,
            "К Почемугриву": `Здравствуйте,\n\nЕсли Вы считаете, что произошёл баг, пожалуйста, обратитесь к [url=https://catwar.net/cat/support]Почемугриву[/url].\n\nС уважением, Святой Кроль`,
            "Ошиб. блок": `Здравствуйте,\n\nЕсли Вы считаете, что произошла ошибка, обратитесь к [url=https://catwar.net/cat7272]Почтовику[/url]. Уверяю Вас, если действительно возникла ошибка, то Вам обязательно помогут.\n\nС уважением, Святой Кроль`,
            "Перенос пропуска": `Здравствуйте,\n\nВопросы, касающиеся переноса пропуска, рассматривает [url=https://catwar.net/cat25235]Перепись[/url]. Обратитесь, пожалуйста, к ней.\n\nС уважением, Святой Кроль`
        };

        function createTemplatePanel(textarea) {
            const panel = document.createElement('div');
            panel.className = 'catwar-templates';
            panel.style.cssText = `margin:10px 0;padding:12px;background:rgb(38,38,38);border-radius:8px;border:1px solid #555;color:#e0e0e0;font-family:Arial,sans-serif;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3);`;
            
            panel.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <div style="font-weight:bold;font-size:14px;display:flex;align-items:center;gap:8px;">
                        <span style="font-size:16px;">🐇</span><span>Быстрые ответы</span>
                    </div>
                    <span class="close-templates" style="cursor:pointer;font-size:18px;opacity:0.7;padding:0 5px;line-height:1;color:#aaa;" title="Скрыть шаблоны">×</span>
                </div>
            `;

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:6px;';

            Object.entries(templates).forEach(([name, text]) => {
                const btn = document.createElement('button');
                btn.textContent = name; btn.title = text;
                btn.style.cssText = 'padding:6px 8px;background:#4a4a4a;color:#e0e0e0;border:1px solid #666;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;transition:all 0.2s;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;';
                btn.onmouseenter = () => { btn.style.background = '#5a5a5a'; btn.style.borderColor = '#777'; };
                btn.onmouseleave = () => { btn.style.background = '#4a4a4a'; btn.style.borderColor = '#666'; };
                btn.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    textarea.value = text; textarea.focus();
                    const origBg = btn.style.background, origCol = btn.style.color;
                    btn.style.background = '#2e7d32'; btn.style.color = 'white';
                    setTimeout(() => { btn.style.background = origBg; btn.style.color = origCol; }, 300);
                };
                btnContainer.appendChild(btn);
            });

            panel.appendChild(btnContainer);
            panel.querySelector('.close-templates').onclick = (e) => { e.preventDefault(); e.stopPropagation(); panel.style.display = 'none'; };
            return panel;
        }

        function addTemplatesToTickets() {
            document.querySelectorAll('textarea').forEach((textarea) => {
                const parentText = textarea.parentElement ? textarea.parentElement.textContent : '';
                if (parentText.includes('Сохранить блокнот')) return;
                if (!(parentText.includes('Отправить') || parentText.includes('Пометить прочитанным') || parentText.includes('Забронировать'))) return;
                if (textarea.previousElementSibling && textarea.previousElementSibling.classList && textarea.previousElementSibling.classList.contains('catwar-templates')) return;
                textarea.parentNode.insertBefore(createTemplatePanel(textarea), textarea);
            });
        }

        function addTemplatesSimple() {
            const allTextAreas = document.querySelectorAll('textarea');
            for (let i = 1; i < allTextAreas.length; i++) {
                const textarea = allTextAreas[i];
                if (textarea.previousElementSibling && textarea.previousElementSibling.classList && textarea.previousElementSibling.classList.contains('catwar-templates')) continue;
                textarea.parentNode.insertBefore(createTemplatePanel(textarea), textarea);
            }
        }

        function initTemplates() {
            setTimeout(() => {
                addTemplatesToTickets();
                setTimeout(() => {
                    if (document.querySelectorAll('.catwar-templates').length === 0) {
                        addTemplatesSimple();
                    }
                }, 500);
            }, 1500);
        }

        window.addEventListener('load', initTemplates);

        const templateObserver = new MutationObserver(() => {
            setTimeout(addTemplatesSimple, 500);
        });

        templateObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            const panels = document.querySelectorAll('.catwar-templates');
            const textAreas = document.querySelectorAll('textarea');
            if (textAreas.length > 1 && panels.length < textAreas.length - 1) {
                addTemplatesSimple();
            }
        }, 3000);

        const style = document.createElement('style');
        style.textContent = `.catwar-templates button:hover::after { content: attr(title); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.95); color: #e0e0e0; padding: 8px; border-radius: 4px; font-size: 11px; white-space: pre-wrap; max-width: 300px; z-index: 1000; margin-bottom: 5px; pointer-events: none; border: 1px solid #555; text-align: left; }`;
        document.head.appendChild(style);
    }

    // === БЛОК 4: ЗАМЕТКИ И ТЕГИ (от Панк-Рок, только для /plak) ===
    if (path.startsWith('/plak')) {
        (function() {
            const API_URL = 'https://script.google.com/macros/s/AKfycbxlofeuEtCo6uVfm2ogwFT_izt8OaihfPXpvwANnGhHe_I-yHk2DZYPh_RLI92fHKtu/exec';
            const TAG_PRESETS = { 'Свободно': '#c8dbb8', 'Без решения': '#addbdb', 'Срочно': '#dc3545', 'Геймдизайн': '#198754', 'Форум: создан': '#f9db73', 'Форум: помогите': '#fd7e14', 'Это ОПИ?': '#c2c2c2', 'Это сложное?': '#191970', 'Мамы это вам': '#f9c3fd', 'БАНКА': '#fbacdc', 'Виола': '#a63e9b', 'Ксанта': '#46b7b9', 'Мульты': '#8f91fa', 'Надув': '#DA70D6', 'Воскрешение': '#5dda95', 'ОПИ3': '#ffa31f', 'ОПИ9': '#00FF7F', 'ОПИ10': '#6c757d', 'Кухня': '#ba5036', 'ЛС группы': '#34a1b6', 'Моды': '#b02412', 'Святой Кроль': '#ffeb20', 'Экономика': '#0b9801', 'Высшие силы': '#000000' };
            const ICONS = {
                edit: `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
                trash: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
                archive: `<svg viewBox="0 0 24 24"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`,
                save: `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
                cancel: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
                tag: `<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.41l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.38-.38.59-.88.59-1.41s-.23-1.04-.59-1.41zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`,
                note: `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`
            };

            let globalData = {};
            let CURRENT_USER = localStorage.getItem('cw_team_username');
            if (!CURRENT_USER) {
                CURRENT_USER = prompt("Скрипт тегов: введите вашу кличку для команды (будет видно в логах):", "Аноним");
                localStorage.setItem('cw_team_username', CURRENT_USER || "Аноним");
                CURRENT_USER = CURRENT_USER || "Аноним";
            }

            GM_addStyle(`
                .cn-wrap { float:right; display:inline-flex; align-items:center; gap:8px; position:relative; font-family:system-ui,-apple-system,sans-serif; font-size:13px; z-index:1; margin-left:10px; }
                .cn-wrap.active-wrap { z-index:99999; }
                .cn-add-btn { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; background:#fff; border:1px solid #cdd4da; border-radius:4px; cursor:pointer; color:#6c757d; transition:all 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.05); }
                .cn-add-btn:hover { background:#f8f9fa; color:#007bff; border-color:#007bff; }
                .cn-add-btn svg { width:14px; height:14px; fill:currentColor; }
                .cn-tag-list { display:inline-flex; gap:4px; flex-wrap:wrap; align-items:center; }
                .cn-badge { padding:3px 8px; border-radius:12px; font-size:11px; font-weight:600; cursor:pointer; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.3); border:1px solid rgba(0,0,0,0.1); transition:opacity 0.2s;}
                .cn-badge:hover { opacity:0.8; }
                .cn-title { cursor:pointer; font-weight:600; transition:opacity 0.2s; background:rgba(255,255,255,0.7); padding:2px 6px; border-radius:4px; }
                .cn-title:hover { opacity:1; background:#fff; }
                .cn-popup { opacity:0; visibility:hidden; transform:translateY(-10px); position:absolute; right:0; top:100%; margin-top:6px; background:#fff; border:1px solid #eaeaea; padding:12px; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.2); transition:all 0.2s cubic-bezier(0.25,0.8,0.25,1); }
                .cn-popup.active { opacity:1; visibility:visible; transform:translateY(0); }
                .cn-popup.note-popup { min-width:280px; }
                .cn-popup.tag-popup { min-width:200px; }
                .cn-popup textarea, .cn-popup input[type="text"] { width:100%; box-sizing:border-box; margin-bottom:8px; font-family:inherit; font-size:13px; padding:6px 8px; border:1px solid #ccc; border-radius:4px; outline:none; transition:border-color 0.2s; background:#fff; color:#333 !important; }
                .cn-popup input:focus, .cn-popup textarea:focus { border-color:#007bff; }
                .cn-popup textarea { height:80px; resize:vertical; }
                .cn-checkbox-group { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; max-height:220px; overflow-y:auto; padding-right:5px; }
                .cn-checkbox-group::-webkit-scrollbar { width:6px; }
                .cn-checkbox-group::-webkit-scrollbar-track { background:#f1f1f1; border-radius:4px; }
                .cn-checkbox-group::-webkit-scrollbar-thumb { background:#c1c1c1; border-radius:4px; }
                .cn-checkbox-group::-webkit-scrollbar-thumb:hover { background:#a8a8a8; }
                .cn-search-input { width:100%; box-sizing:border-box; margin-bottom:10px; font-family:inherit; font-size:13px; padding:6px 8px; border:1px solid #ccc; border-radius:4px; outline:none; transition:border-color 0.2s; }
                .cn-search-input:focus { border-color:#007bff; }
                .cn-hidden { display:none !important; }
                .cn-checkbox-label { display:flex; align-items:center; gap:8px; cursor:pointer; color:#333 !important; font-size:13px; transition:opacity 0.2s;}
                .cn-checkbox-label:hover { opacity:0.8; }
                .cn-checkbox-label input { cursor:pointer; margin:0; width:14px; height:14px; }
                .cn-checkbox-dot { display:inline-block; width:10px; height:10px; border-radius:50%; box-shadow:0 1px 2px rgba(0,0,0,0.2); }
                .cn-color-picker { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-size:12px; color:#555 !important;}
                .cn-color-picker input[type="color"] { cursor:pointer; border:1px solid #ccc; border-radius:4px; width:30px; height:30px; padding:0; background:#fff; }
                .cn-text { margin-bottom:12px; white-space:pre-wrap; color:#333 !important; line-height:1.4; max-height:200px; overflow-y:auto; }
                .cn-history-block { background:#f8f9fa; border:1px dashed #ced4da; padding:8px; border-radius:4px; font-size:11px; color:#6c757d; margin-bottom:10px; line-height:1.3; }
                .cn-history-block b { color:#495057; display:block; margin-bottom:4px; }
                .cn-history-block i { color:#333; }
                .cn-author-tag { display:inline-block; background:#e9ecef; color:#495057; padding:1px 4px; border-radius:3px; font-size:9px; margin-left:4px; border:1px solid #dee2e6; }
                .cn-controls { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; align-items:center; }
                .cn-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:5px; color:#333 !important; }
                .cn-close { cursor:pointer; color:#999; font-size:18px; line-height:1; margin-left:auto; transition:color 0.2s; }
                .cn-close:hover { color:#dc3545; }
                .cn-btn { cursor:pointer; background:transparent; border:none; padding:4px; border-radius:4px; display:flex; align-items:center; justify-content:center; transition:background 0.2s; color:#555; }
                .cn-btn:hover { background:#f0f0f0; }
                .cn-btn svg { width:16px; height:16px; fill:currentColor; }
                .cn-btn.delete:hover { color:#dc3545; background:#f8d7da; }
                .cn-btn.archive:hover { color:#0dcaf0; background:#e0f8f8; }
                .cn-btn.save { color:#198754; }
                .cn-btn.save:hover { background:#d1e7dd; }
                .cn-timestamp { font-size:10px; color:#adb5bd; margin-top:8px; text-align:right; }
                .cn-loader { display:inline-block; width:12px; height:12px; border:2px solid #ccc; border-top-color:#007bff; border-radius:50%; animation:cn-spin 1s linear infinite; margin-right:5px; }
                @keyframes cn-spin { to { transform:rotate(360deg); } }
            `);

            function fetchData(callback) {
                const cached = sessionStorage.getItem('cw_data_cache_v5');
                const isFromAnotherPage = document.referrer && !document.referrer.includes('/plak');
                if (cached && !isFromAnotherPage) {
                    globalData = JSON.parse(cached);
                    return callback();
                }
                GM_xmlhttpRequest({
                    method: "GET", url: API_URL,
                    onload: function(res) {
                        if (res.status === 200) {
                            globalData = JSON.parse(res.responseText);
                            sessionStorage.setItem('cw_data_cache_v5', JSON.stringify(globalData));
                            callback();
                        } else console.error("Ошибка загрузки базы тегов");
                    }
                });
            }

            function syncData(userId, newData, callback) {
                const isEmpty = !newData.tagText && !newData.title && (!newData.history || Object.keys(newData.history).length === 0);
                const action = isEmpty ? 'delete' : 'save';
                GM_xmlhttpRequest({
                    method: "POST", url: API_URL, data: JSON.stringify({ action, userId, ...newData }),
                    headers: { "Content-Type": "text/plain" },
                    onload: function() {
                        if (action === 'delete') delete globalData[userId];
                        else globalData[userId] = { ...newData };
                        sessionStorage.setItem('cw_data_cache_v5', JSON.stringify(globalData));
                        callback();
                    }
                });
            }

            function initNotesTags() {
                const pToggles = document.querySelectorAll('p.p_toggle');
                pToggles.forEach(p => {
                    const l = document.createElement('span'); l.className = 'custom-loading'; l.style.cssText = 'float:right;font-size:12px;color:#888;'; l.innerHTML = '<span class="cn-loader"></span>';
                    p.appendChild(l);
                });

                fetchData(() => {
                    document.querySelectorAll('.custom-loading').forEach(el => el.remove());
                    pToggles.forEach(p => {
                        const userLink = p.querySelector('a[href^="/cat"]');
                        if (!userLink) return;
                        const match = userLink.getAttribute('href').match(/\d+/);
                        if (!match) return;

                        const wrap = document.createElement('span');
                        wrap.className = 'cn-wrap';
                        wrap.addEventListener('click', e => e.stopPropagation());
                        wrap.addEventListener('mousedown', e => e.stopPropagation());
                        p.appendChild(wrap);
                        renderUI(wrap, match[0]);
                    });
                });

                document.addEventListener('click', e => { if (!e.target.closest('.cn-wrap')) closeAllPopups(); });
                document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllPopups(); });
            }

            function renderUI(wrap, userId) {
                wrap.innerHTML = ''; wrap.classList.remove('active-wrap');
                const data = globalData[userId] || { tagText: '', titleColor: '#0056b3', title: '', desc: '', noteTimestamp: '', tagTimestamp: '', tagAuthor: '', noteAuthor: '', history: {} };
                const tagDateStr = data.tagTimestamp ? new Date(data.tagTimestamp).toLocaleString('ru-RU') : '';
                const noteDateStr = data.noteTimestamp ? new Date(data.noteTimestamp).toLocaleString('ru-RU') : '';

                const tagContainer = document.createElement('div'); tagContainer.className = 'cn-tag-list';
                const toggleTag = () => { const isOpen = wrap.querySelector('.tag-popup'); closeAllPopups(); if (!isOpen) renderTagEditor(wrap, userId, data, tagDateStr); };
                const tagsArray = data.tagText ? data.tagText.split(',').filter(t => t.trim() !== '') : [];

                if (tagsArray.length > 0) {
                    tagsArray.forEach(tag => {
                        const badge = document.createElement('span');
                        badge.className = 'cn-badge'; badge.style.backgroundColor = TAG_PRESETS[tag] || '#6c757d'; badge.textContent = tag;
                        badge.title = tagDateStr ? `Автор: ${data.tagAuthor || '?'}\nОбновлено: ${tagDateStr}\nКликните для настройки` : "Настроить теги";
                        badge.addEventListener('click', toggleTag);
                        tagContainer.appendChild(badge);
                    });
                } else {
                    const btn = document.createElement('div'); btn.className = 'cn-add-btn'; btn.innerHTML = ICONS.tag;
                    btn.title = data.history?.tag ? "Добавить теги (есть архив)" : "Добавить теги";
                    if (data.history?.tag) btn.style.borderColor = '#fd7e14';
                    btn.addEventListener('click', toggleTag);
                    tagContainer.appendChild(btn);
                }

                const noteContainer = document.createElement('div');
                const toggleNote = () => { const p = wrap.querySelector('.note-popup'); const isActive = p?.classList.contains('active'); closeAllPopups(); if (!isActive && p) { wrap.classList.add('active-wrap'); p.classList.add('active'); } };

                if (data.title) {
                    const titleEl = document.createElement('span'); titleEl.className = 'cn-title'; titleEl.style.color = data.titleColor || '#0056b3'; titleEl.textContent = '📝 ' + data.title;
                    const popup = document.createElement('div'); popup.className = 'cn-popup note-popup';
                    let hHtml = '';
                    if (data.history?.note) { const h = data.history.note; hHtml = `<div class="cn-history-block"><b>Архив от ${new Date(h.archivedAt).toLocaleString('ru-RU')} <span class="cn-author-tag">${h.archivedBy || '?'}</span>:</b>Заголовок: <i>${h.title}</i><br>Описание: <i>${h.desc}</i></div>`; }

                    popup.innerHTML = `<div class="cn-header"><strong>Детали заметки</strong><span class="cn-close">&times;</span></div>${hHtml}<div class="cn-text">${data.desc || 'Нет описания'}</div><div class="cn-controls"><button class="cn-btn edit" title="Изменить">${ICONS.edit}</button><button class="cn-btn archive" title="В архив">${ICONS.archive}</button><button class="cn-btn delete" title="Удалить">${ICONS.trash}</button></div>${noteDateStr ? `<div class="cn-timestamp">Обновил(а) <b>${data.noteAuthor || '?'}</b> (${noteDateStr})</div>` : ''}`;

                    titleEl.addEventListener('click', toggleNote);
                    popup.querySelector('.cn-close').addEventListener('click', () => { popup.classList.remove('active'); wrap.classList.remove('active-wrap'); });
                    popup.querySelector('.edit').addEventListener('click', () => { closeAllPopups(); renderNoteEditor(wrap, userId, data); });
                    popup.querySelector('.archive').addEventListener('click', () => {
                        if(!confirm('В архив?')) return;
                        const newHist = data.history || {}; newHist.note = { title: data.title, desc: data.desc, archivedAt: new Date().toISOString(), archivedBy: CURRENT_USER };
                        popup.querySelector('.archive').innerHTML = '<span class="cn-loader" style="margin:0"></span>';
                        syncData(userId, { ...data, title: '', desc: '', titleColor: '#0056b3', noteTimestamp: '', noteAuthor: '', history: newHist }, () => renderUI(wrap, userId));
                    });
                    popup.querySelector('.delete').addEventListener('click', () => { if(confirm('Удалить навсегда?')) syncData(userId, { ...data, title: '', desc: '', noteTimestamp: '', noteAuthor: '' }, () => renderUI(wrap, userId)); });
                    noteContainer.append(titleEl, popup);
                } else {
                    const btn = document.createElement('div'); btn.className = 'cn-add-btn'; btn.innerHTML = ICONS.note;
                    btn.title = data.history?.note ? "Добавить заметку (есть архив)" : "Добавить заметку";
                    if (data.history?.note) btn.style.borderColor = '#fd7e14';
                    btn.addEventListener('click', () => { const isOpen = wrap.querySelector('.note-popup.active'); closeAllPopups(); if (!isOpen) renderNoteEditor(wrap, userId, data); });
                    noteContainer.appendChild(btn);
                }
                wrap.append(tagContainer, noteContainer);
            }

            function renderTagEditor(wrap, userId, data, tagDateStr) {
                renderUI(wrap, userId); wrap.classList.add('active-wrap');
                const popup = document.createElement('div'); popup.className = 'cn-popup tag-popup active';
                let hHtml = '';
                if (data.history?.tag) { const h = data.history.tag; hHtml = `<div class="cn-history-block"><b>Неактуально с ${new Date(h.archivedAt).toLocaleString('ru-RU')} <span class="cn-author-tag">${h.archivedBy || '?'}</span>:</b>Были теги: <i>${h.text}</i></div>`; }

                const tagsArray = data.tagText ? data.tagText.split(',').filter(t => t.trim() !== '') : [];
                let cbHtml = '<div class="cn-checkbox-group">';
                for (const [name, color] of Object.entries(TAG_PRESETS)) cbHtml += `<label class="cn-checkbox-label" data-tag="${name.toLowerCase()}"><input type="checkbox" value="${name}" ${tagsArray.includes(name) ? 'checked' : ''}><span class="cn-checkbox-dot" style="background-color: ${color}"></span>${name}</label>`;
                cbHtml += '</div>';

                popup.innerHTML = `<div class="cn-header"><strong>Настройка тегов</strong></div>${hHtml}<input type="text" class="cn-search-input" placeholder="Поиск..." autofocus>${cbHtml}<div class="cn-controls"><button class="cn-btn delete" title="Очистить">${ICONS.trash}</button>${data.tagText ? `<button class="cn-btn archive" title="В архив">${ICONS.archive}</button>` : ''}<div style="flex-grow:1"></div><button class="cn-btn save" title="Сохранить">${ICONS.save}</button><button class="cn-btn cancel" title="Отмена">${ICONS.cancel}</button></div>${tagDateStr ? `<div class="cn-timestamp">Обновил(а): <b>${data.tagAuthor || '?'}</b> (${tagDateStr})</div>` : ''}`;
                wrap.children[0].appendChild(popup);

                const search = popup.querySelector('.cn-search-input'), labels = popup.querySelectorAll('.cn-checkbox-label');
                search.addEventListener('input', e => {
                    const q = e.target.value.toLowerCase().trim();
                    labels.forEach(l => l.classList.toggle('cn-hidden', !l.getAttribute('data-tag').includes(q)));
                });

                const saveAction = () => {
                    const selected = Array.from(popup.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value).join(',');
                    popup.querySelector('.save').innerHTML = '<span class="cn-loader" style="margin:0"></span>';
                    syncData(userId, { ...data, tagText: selected, tagTimestamp: new Date().toISOString(), tagAuthor: CURRENT_USER }, () => renderUI(wrap, userId));
                };

                const archiveBtn = popup.querySelector('.archive');
                if (archiveBtn) archiveBtn.addEventListener('click', () => {
                    if(!confirm('В архив?')) return;
                    const newHist = data.history || {}; newHist.tag = { text: data.tagText, archivedAt: new Date().toISOString(), archivedBy: CURRENT_USER };
                    archiveBtn.innerHTML = '<span class="cn-loader" style="margin:0"></span>';
                    syncData(userId, { ...data, tagText: '', tagTimestamp: '', tagAuthor: '', history: newHist }, () => renderUI(wrap, userId));
                });

                popup.querySelector('.save').addEventListener('click', saveAction);
                popup.querySelector('.delete').addEventListener('click', () => syncData(userId, { ...data, tagText: '', tagTimestamp: '', tagAuthor: '' }, () => renderUI(wrap, userId)));
                popup.querySelector('.cancel').addEventListener('click', () => renderUI(wrap, userId));
                popup.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') saveAction(); });
            }

            function renderNoteEditor(wrap, userId, data) {
                renderUI(wrap, userId); wrap.classList.add('active-wrap');
                const popup = document.createElement('div'); popup.className = 'cn-popup note-popup active';
                let hHtml = '';
                if (data.history?.note) { const h = data.history.note; hHtml = `<div class="cn-history-block"><b>Неактуально с ${new Date(h.archivedAt).toLocaleString('ru-RU')} <span class="cn-author-tag">${h.archivedBy || '?'}</span>:</b>Заголовок: <i>${h.title}</i><br>Описание: <i>${h.desc}</i></div>`; }

                popup.innerHTML = `<div class="cn-header"><strong>Редактирование заметки</strong></div>${hHtml}<input type="text" placeholder="Заголовок (обязательно)" value="${data.title || ''}" class="cn-input-title" autofocus><div class="cn-color-picker"><input type="color" value="${data.titleColor || '#0056b3'}" class="cn-color"><span>Цвет</span></div><textarea placeholder="Описание...">${data.desc || ''}</textarea><div class="cn-controls"><button class="cn-btn delete" title="Удалить">${ICONS.trash}</button>${data.title ? `<button class="cn-btn archive" title="В архив">${ICONS.archive}</button>` : ''}<div style="flex-grow:1"></div><span class="cn-timestamp" style="margin:0 10px 0 0;">Ctrl+Enter</span><button class="cn-btn save" title="Сохранить">${ICONS.save}</button><button class="cn-btn cancel" title="Отмена">${ICONS.cancel}</button></div>`;
                wrap.children[1].appendChild(popup);

                const saveAction = () => {
                    const t = popup.querySelector('.cn-input-title').value.trim();
                    if (!t) { popup.querySelector('.cn-input-title').style.borderColor = '#dc3545'; return; }
                    popup.querySelector('.save').innerHTML = '<span class="cn-loader" style="margin:0"></span>';
                    syncData(userId, { ...data, title: t, desc: popup.querySelector('textarea').value.trim(), titleColor: popup.querySelector('.cn-color').value, noteTimestamp: new Date().toISOString(), noteAuthor: CURRENT_USER }, () => renderUI(wrap, userId));
                };

                const archiveBtn = popup.querySelector('.archive');
                if (archiveBtn) archiveBtn.addEventListener('click', () => {
                    if(!confirm('В архив?')) return;
                    const newHist = data.history || {}; newHist.note = { title: data.title, desc: data.desc, archivedAt: new Date().toISOString(), archivedBy: CURRENT_USER };
                    archiveBtn.innerHTML = '<span class="cn-loader" style="margin:0"></span>';
                    syncData(userId, { ...data, title: '', desc: '', titleColor: '#0056b3', noteTimestamp: '', noteAuthor: '', history: newHist }, () => renderUI(wrap, userId));
                });

                popup.querySelector('.save').addEventListener('click', saveAction);
                popup.querySelector('.delete').addEventListener('click', () => syncData(userId, { ...data, title: '', desc: '', noteTimestamp: '', noteAuthor: '' }, () => renderUI(wrap, userId)));
                popup.querySelector('.cancel').addEventListener('click', () => renderUI(wrap, userId));
                popup.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') saveAction(); });
            }

            function closeAllPopups() {
                document.querySelectorAll('.cn-wrap').forEach(wrap => {
                    if (wrap.querySelector('.cn-popup.active')) {
                        const m = wrap.parentNode.innerHTML.match(/\/cat(\d+)/);
                        if(m) renderUI(wrap, m[1]);
                    }
                });
            }

            initNotesTags();
        })();
    }
})();
