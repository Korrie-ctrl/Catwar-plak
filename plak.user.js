// ==UserScript==
// @name         CatWar Plak
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Добавляет кнопку "Занять/Освободить" на страницу жалоб (Firebase Edition)
// @author       Берсерк
// @match        https://catwar.net/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DB_URL = 'https://catwar-plak-default-rtdb.europe-west1.firebasedatabase.app/claims.json';

    if (window.location.pathname === '/' || window.location.pathname === '/index') {
        const nameEl = document.querySelector('#pr big');
        const idEl = document.querySelector('#id_val');

        if (nameEl && idEl) {
            localStorage.setItem('cw_mod_name', nameEl.innerText.trim());
            localStorage.setItem('cw_mod_id', idEl.innerText.trim());
        }
        return;
    }

    if (window.location.pathname === '/plak') {
        const myId = localStorage.getItem('cw_mod_id');
        const myName = localStorage.getItem('cw_mod_name');

        if (!myId || !myName) {
            console.warn('CatWar Plak Claimer: Не найдены данные пользователя. Зайди на страницу "мой кот".');
            return;
        }

        let claimsDb = {};

        function fetchClaims() {
            GM_xmlhttpRequest({
                method: "GET",
                url: DB_URL,
                onload: function(response) {
                    if (response.status === 200) {
                        claimsDb = JSON.parse(response.responseText) || {};
                        updateUI();
                    }
                }
            });
        }

        function saveClaim(ticketId) {
            claimsDb[ticketId] = {
                id: myId,
                name: myName,
                timestamp: Date.now()
            };
            updateUI();
            syncWithServer();
        }

        function removeClaim(ticketId) {
            delete claimsDb[ticketId];
            updateUI();
            syncWithServer();
        }

        function syncWithServer() {
            GM_xmlhttpRequest({
                method: "PUT",
                url: DB_URL,
                data: JSON.stringify(claimsDb),
                onload: function(response) {
                    if (response.status !== 200) {
                        console.error("Ошибка синхронизации Firebase!", response.responseText);
                    }
                }
            });
        }

        function updateUI() {
            const difficultBtns = document.querySelectorAll('a[href^="plak?set_difficult="]');

            difficultBtns.forEach(btn => {
                const url = new URL(btn.href, window.location.origin);
                const ticketId = url.searchParams.get('set_difficult');
                const pContainer = btn.closest('p');
                const messagesDiv = btn.closest('.messages');
                const headerP = messagesDiv.previousElementSibling;
                const linkEl = headerP.querySelector('b a');

                let actionSpan = pContainer.querySelector('.cw-action-span');
                if (!actionSpan) {
                    actionSpan = document.createElement('span');
                    actionSpan.className = 'cw-action-span';
                    pContainer.appendChild(document.createTextNode(' | '));
                    pContainer.appendChild(actionSpan);
                }

                actionSpan.innerHTML = '';

                // Очищаем старые метки "Занял"
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
                        unclaimBtn.onclick = (e) => {
                            e.preventDefault();
                            removeClaim(ticketId);
                        };
                        actionSpan.appendChild(unclaimBtn);
                    } else {
                        headerP.style.backgroundColor = '#fdf5e6';
                        headerP.style.border = '1px solid #faebd7';
                        headerP.style.color = '#8b4513';
                    }
                } else {
                    headerP.style.backgroundColor = '';
                    headerP.style.border = '';
                    headerP.style.color = '';
                    if (linkEl) linkEl.style.color = '';

                    const claimBtn = document.createElement('a');
                    claimBtn.href = '#';
                    claimBtn.innerText = 'Занять';
                    claimBtn.style.color = '#28a745';
                    claimBtn.style.fontWeight = 'bold';
                    claimBtn.onclick = (e) => {
                        e.preventDefault();
                        saveClaim(ticketId);
                    };
                    actionSpan.appendChild(claimBtn);
                }
            });
        }

        fetchClaims();
        setInterval(fetchClaims, 30000);
    }
})();
