// ==UserScript==
// @name         CartelTools
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  For the CartelEmpire game. Estimates BS when viewing fight logs of successful attacks from yourself. Uploads to and fetch records from CEStats server.
// @author       BOT7420 [3094]
// @match        https://cartelempire.online/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      43.129.194.214
// @grant        GM_notification
// @run-at       document-start
// ==/UserScript==

(async function () {
    "use strict";

    let API_KEY = "XXXXXXXXXX"; // 这里改成自己的APIKey，权限Limited等级以上，改过一次就行，未来更新可能不需要再改

    /* 以下不需要修改 */
    if (API_KEY && API_KEY !== "XXXXXXXXXX") {
        localStorage.setItem("script_api_key", API_KEY);
    } else if (localStorage.getItem("script_api_key")) {
        API_KEY = localStorage.getItem("script_api_key");
    } else {
        console.log("[CartelTools] No API Key!");
    }

    GM_addStyle(`
        table#script_spy_table, table#script_spy_table th, table#script_spy_table td {
            border: 1px solid black;
            border-collapse: collapse;
        }`);

    const currentURL = window.location.href.toLowerCase();
    if (currentURL.includes("/fight/")) {
        const urlSplit = currentURL.split("/");
        const id = urlSplit[urlSplit.length - 1];
        await handleFightLogPage(id);
    } else if (currentURL.includes("/user/")) {
        const urlSplit = currentURL.split("/");
        const id = urlSplit[urlSplit.length - 1];
        handleProfilePage(id);
    }

    async function handleFightLogPage(logId) {
        console.log("[CartelTools] handleFightLogPage");
        const selfTotalBS = await getSelfTotalBS();
        const selfId = localStorage.getItem("script_self_id");
        const selfName = localStorage.getItem("script_self_name");

        const checkElementExist = () => {
            const selectedElem = document.querySelector(`div.table-responsive.fightTable`);
            if (selectedElem) {
                clearInterval(timer);
                let isInitiatorSelf = true;
                if (selectedElem.querySelector(`td`).querySelectorAll(`a`).length > 1) {
                    console.log("[CartelTools] handleFightLogPage fight not involving self.");
                    return;
                }
                if (selectedElem.querySelector(`td`).innerText.includes("against you")) {
                    console.log("[CartelTools] handleFightLogPage fight initiated by others against self.");
                    isInitiatorSelf = false;
                }
                const logElem = selectedElem.querySelector(`td`).querySelector(`a`);
                const hrefSplit = logElem.href.split("/");
                const opponentId = hrefSplit[hrefSplit.length - 1];
                const opponentName = logElem.innerHTML.substring(1);

                const FFElem = document.querySelector(`div.card-body div`).querySelectorAll(`div.card-body div`)[1].querySelector(`span`);
                const FF = Number(FFElem.innerHTML.substring(1));
                let estimateBSString = "";
                if (FF > 1 && FF < 3) {
                    if (isInitiatorSelf) {
                        estimateBSString = "" + (((FF - 1) / 8) * 3 * selfTotalBS).toFixed(0);
                    } else {
                        estimateBSString = "" + (((selfTotalBS / 3) * 8) / (FF - 1)).toFixed(0);
                    }
                } else if (FF == 3) {
                    if (isInitiatorSelf) {
                        estimateBSString = ">" + (selfTotalBS * 0.75).toFixed(0);
                    } else {
                        estimateBSString = "<" + ((selfTotalBS * 8) / 6).toFixed(0);
                    }
                } else if (FF == 1) {
                    if (isInitiatorSelf) {
                        estimateBSString = "远小于" + selfTotalBS.toFixed(0);
                    } else {
                        estimateBSString = "远大于" + selfTotalBS.toFixed(0);
                    }
                }
                FFElem.innerHTML += "<br>估计对手总BS " + estimateBSString;

                saveEstimateBS(logId, opponentId, opponentName, estimateBSString);

                const newButton = document.createElement("button");
                newButton.textContent = "上传至CEStats";
                newButton.style.backgroundColor = "green";
                newButton.addEventListener("click", async () => {
                    if (logId && opponentId && opponentName && estimateBSString && !estimateBSString.includes("NaN") && selfId && selfName) {
                        newButton.disabled = true;
                        newButton.textContent = "正在上传...";
                        const result = await uploadToSES(logId, opponentId, opponentName, estimateBSString, selfId, selfName, "一键上传");
                        console.log(result);
                        newButton.textContent = result;
                        newButton.disabled = false;
                        if (result.includes("上传成功")) {
                            //window.open("https://cartelempire.online/User/" + opponentId, "_blank");
                        }
                    } else {
                        newButton.textContent = "参数错误，是否已输入正确的Limited API？";
                    }
                });
                FFElem.parentNode.insertBefore(newButton, FFElem.nextSibling);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function uploadToSES(logId, opponentId, opponentName, estimateBSString, selfId, selfName, reportSource) {
        let model = {
            reporterId: selfId,
            reporterName: selfName,
            targetId: opponentId,
            targetName: opponentName,
            bs: estimateBSString,
            logId: logId,
            logTimestamp: null,
            reportTimestamp: Date.now(),
            reportSource: reportSource,
        };

        console.log(model);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `http://43.129.194.214:3000/api/spy/upload/`,
                headers: {
                    "Content-Type": "application/json",
                },
                data: JSON.stringify(model),
                onload: function (response) {
                    if (!response || !response.response) {
                        resolve("网络错误");
                    }
                    const json = JSON.parse(response.response);
                    console.log(json);
                    if (json.httpStatus === 200 && json.success === true && json.message) {
                        resolve(json.message);
                    } else {
                        resolve(json.message ? json.message : "未知错误");
                    }
                },
                onerror: function (error) {
                    console.log("onerror");
                    console.log(error);
                    resolve("网络错误");
                },
            });
        });
    }

    function fetchSESSpy(opponentId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `http://43.129.194.214:3000/api/spy/?userid=${opponentId}`,
                headers: {
                    "Content-Type": "application/json",
                },
                onload: function (response) {
                    if (!response || !response.response) {
                        resolve("网络错误");
                    }
                    const json = JSON.parse(response.response);
                    console.log(json);
                    if (json.httpStatus === 200 && json.success === true && json.result) {
                        resolve(json.result);
                    } else {
                        resolve(json.message ? json.message : "未知错误");
                    }
                },
                onerror: function (error) {
                    console.log("onerror");
                    console.log(error);
                    resolve("网络错误onerror");
                },
            });
        });
    }

    function getSelfTotalBS() {
        if (
            localStorage.getItem("script_self_id") &&
            localStorage.getItem("script_self_total_bs_timestamp") &&
            Date.now() - Number(localStorage.getItem("script_self_total_bs_timestamp")) < 1800000 &&
            Number(localStorage.getItem("script_self_total_bs")) !== 0 &&
            !Number.isNaN(Number(localStorage.getItem("script_self_total_bs")))
        ) {
            return Number(localStorage.getItem("script_self_total_bs"));
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://cartelempire.online/api/user?type=basic,BattleStats&key=${API_KEY}`,
                headers: {
                    "Content-Type": "application/json",
                },
                onload: function (response) {
                    const json = JSON.parse(response.response);
                    console.log(json);
                    let totalBS = json.strength + json.defence + json.agility + json.accuracy;
                    localStorage.setItem("script_self_id", json.userId);
                    localStorage.setItem("script_self_name", json.name);
                    localStorage.setItem("script_self_total_bs", totalBS);
                    localStorage.setItem("script_self_total_bs_timestamp", Date.now());
                    resolve(totalBS);
                },
                onerror: function (error) {
                    reject(error);
                },
            });
        });
    }

    function fetchUser(id) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://cartelempire.online/api/user?id=${id}type=basic,BattleStats&key=${API_KEY}`,
                headers: {
                    "Content-Type": "application/json",
                },
                onload: function (response) {
                    const json = JSON.parse(response.response);
                    console.log(json);
                    resolve(json);
                },
                onerror: function (error) {
                    reject(error);
                },
            });
        });
    }

    function saveEstimateBS(logId, opponentId, opponentName, estimateBSString) {
        let map = null;
        if (localStorage.getItem("script_estimate_bs_list")) {
            map = new Map(JSON.parse(localStorage.getItem("script_estimate_bs_list")));
        } else {
            map = new Map();
        }
        let obj = map.get(opponentId);
        if (!obj) {
            obj = {};
            obj.playerId = opponentId;
            obj.playerName = opponentName;
            obj.logList = [];
            map.set(opponentId, obj);
        }
        obj.logList = []; // Curretly only keep one record
        let log = {};
        log.logId = logId;
        log.estimateBSString = estimateBSString;
        log.timestamp = Date.now();
        log.isLocalEstimate = true;
        obj.logList.push(log);
        localStorage.setItem("script_estimate_bs_list", JSON.stringify(Array.from(map.entries())));
        console.log(map);
    }

    function readEstimateBS(playerId) {
        let map = null;
        if (localStorage.getItem("script_estimate_bs_list")) {
            map = new Map(JSON.parse(localStorage.getItem("script_estimate_bs_list")));
        } else {
            return null;
        }
        console.log(map);
        return map.get(playerId);
    }

    function stakeOut(id, targetName) {
        let lastCheckIsOkay = false;
        const checkUser = async () => {
            const json = await fetchUser(id);
            if (json && json.status) {
                if (!lastCheckIsOkay && json.status.includes("Active")) {
                    console.log("stakeout alert!");
                    GM_notification({
                        text: "Stakeout已停止",
                        title: targetName + " [" + id + "] 出院/出狱",
                        timeout: 3600000,
                        url: "https://cartelempire.online/user/" + id,
                        onclick: (event) => {},
                    });
                }
                if (json.status.includes("Active")) {
                    lastCheckIsOkay = true;
                } else {
                    lastCheckIsOkay = false;
                }
            }
        };
        let timer = setInterval(checkUser, 2000);
    }

    function handleProfilePage(id) {
        console.log("[CartelTools] handleProfilePage");
        const checkElementExist = async () => {
            const selectedElem = document.querySelector(`div.header-section h2 svg`);
            if (selectedElem) {
                clearInterval(timer);
                await getSelfTotalBS();
                const selfId = localStorage.getItem("script_self_id");
                const selfName = localStorage.getItem("script_self_name");
                let targetName = selectedElem.parentElement.innerText.substring(1);

                const bsString = readEstimateBS(id);
                if (bsString && bsString.logList && bsString.logList[0]) {
                    selectedElem.parentElement.parentElement.innerHTML += "&nbsp;&nbsp;估计总BS " + bsString.logList[0].estimateBSString;
                }

                const card = document.querySelector(`img.img-thumbnail`).parentElement.parentElement.parentElement;

                const stakeOutDiv = document.createElement("div");
                const stakeOutButton = document.createElement("button");
                stakeOutButton.textContent = "Stakeout出院提醒";
                stakeOutButton.style.backgroundColor = "red";
                stakeOutButton.addEventListener("click", async () => {
                    if (confirm("是否Stakeout：" + targetName + " [" + id + "]") === false) {
                        return;
                    }
                    console.log("Stakeout：" + targetName + " [" + id + "]");
                    stakeOutButton.disabled = true;
                    stakeOutButton.textContent = "正在Stakeout...请保持此网页打开";
                    stakeOut(id, targetName);
                });
                stakeOutDiv.appendChild(stakeOutButton);

                const listButton = document.createElement("button");
                listButton.textContent = "查看所有Spy列表";
                listButton.style.backgroundColor = "green";
                listButton.addEventListener("click", async () => {
                    window.open("http://43.129.194.214:3000/", "_blank");
                });
                stakeOutDiv.appendChild(listButton);
                card.appendChild(stakeOutDiv);

                const div = document.createElement("div");
                const resultList = await fetchSESSpy(id);
                if (typeof resultList === "string") {
                    div.innerHTML = resultList;
                } else {
                    let html = "";
                    html += "从CEStats查询到 " + resultList.length + " 条记录";
                    html += `<table id="script_spy_table">
                                        <tr>
                                        <th>估计BS</th>
                                        <th>上传者</th>
                                        <th>上传时间</th>
                                        </tr>`;
                    for (const record of resultList) {
                        html += `<tr>`;
                        html += `
                                        <td>${record.bs}</td>
                                        <td>${record.reporterName} [${record.reporterId}]</td>
                                        <td>${new Date(Number(record.reportTimestamp)).toLocaleString()}</td>`;
                        html += `</tr>`;
                    }
                    html += `</table>`;
                    div.innerHTML = html;
                }
                div.setAttribute("class", "row");
                card.appendChild(div);

                const manualUploadDiv = document.createElement("div");
                let input = document.createElement("input");
                input.type = "text";
                input.placeholder = "输入预估对方BS";
                manualUploadDiv.appendChild(input);

                const newButton = document.createElement("button");
                newButton.textContent = "手动上传BS至CEStats";
                newButton.style.backgroundColor = "green";
                newButton.addEventListener("click", async () => {
                    const estimateBSString = input.value;
                    if (!estimateBSString) {
                        alert("输入不能为空");
                        return;
                    }
                    if (confirm("是否上传：" + targetName + " " + estimateBSString) === false) {
                        return;
                    }
                    if (id && targetName && estimateBSString && !estimateBSString.includes("NaN") && selfId && selfName) {
                        newButton.disabled = true;
                        newButton.textContent = "正在上传...";
                        const result = await uploadToSES(Date.now(), id, targetName, estimateBSString, selfId, selfName, "手动上传");
                        console.log(result);
                        newButton.textContent = result;
                        newButton.disabled = false;
                        if (result.includes("上传成功")) {
                            location.reload();
                        }
                    } else {
                        newButton.textContent = "参数错误，是否已输入正确的Limited API？";
                    }
                });
                manualUploadDiv.appendChild(newButton);
                card.appendChild(manualUploadDiv);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }
})();
