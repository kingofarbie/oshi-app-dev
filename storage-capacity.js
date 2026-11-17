
/* =====================================================
   💾 保存容量チェック
   storage-capacity.js

   ・localStorage の使用容量を計算
   ・ブラウザの保存容量を取得
   ・IndexedDB などを含む使用量の目安を取得
   ・容量不足の警告レベルを判定

   ※ 保存データの追加・変更・削除は行わない
===================================================== */


/* =====================================================
   1. localStorage 使用容量
===================================================== */

function getLocalStorageUsage(){

    let totalBytes = 0;

    try{

        for(let i = 0; i < localStorage.length; i++){

            const key = localStorage.key(i);
            const value = localStorage.getItem(key);

            if(key !== null){
                totalBytes += new Blob([key]).size;
            }

            if(value !== null){
                totalBytes += new Blob([value]).size;
            }

        }

    }catch(error){

        console.warn(
            "localStorage容量の取得に失敗しました",
            error
        );

    }

    return {
        bytes: totalBytes,
        kilobytes: totalBytes / 1024,
        megabytes: totalBytes / (1024 * 1024)
    };

}


/* =====================================================
   2. ブラウザ全体の保存容量の目安
===================================================== */

async function getBrowserStorageEstimate(){

    if(
        !navigator.storage ||
        !navigator.storage.estimate
    ){

        return {
            supported: false,
            usage: null,
            quota: null,
            usageDetails: null
        };

    }

    try{

        const estimate =
            await navigator.storage.estimate();

        return {

            supported: true,

            usage: estimate.usage ?? null,

            quota: estimate.quota ?? null,

            usageDetails:
                estimate.usageDetails ?? null

        };

    }catch(error){

        console.warn(
            "ブラウザ保存容量の取得に失敗しました",
            error
        );

        return {
            supported: false,
            usage: null,
            quota: null,
            usageDetails: null
        };

    }

}


/* =====================================================
   3. 容量警告レベル
===================================================== */

function getStorageWarningLevel(usage, quota){

    if(
        typeof usage !== "number" ||
        typeof quota !== "number" ||
        quota <= 0
    ){

        return "unknown";

    }

    const ratio = usage / quota;

    if(ratio >= 0.90){
        return "danger";
    }

    if(ratio >= 0.75){
        return "warning";
    }

    return "safe";

}


/* =====================================================
   4. 容量情報をまとめて取得
===================================================== */

async function getStorageCapacityInfo(){

    const local = getLocalStorageUsage();

    const browser =
        await getBrowserStorageEstimate();

    const warning =
        getStorageWarningLevel(
            browser.usage,
            browser.quota
        );

    return {

        localStorage: local,

        browser: browser,

        warning: warning,

        checkedAt: new Date().toISOString()

    };

}


/* =====================================================
   5. 動作確認
===================================================== */

async function testStorageCapacity(){

    const info = await getStorageCapacityInfo();

    console.log("保存容量チェック結果", info);

    return info;

}


/* =====================================================
   6. 設定画面への容量表示
===================================================== */

function formatStorageSize(bytes){

    if(typeof bytes !== "number"){
        return "取得できません";
    }

    if(bytes < 1024 * 1024){
        return (bytes / 1024).toFixed(1) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";

}


async function refreshStorageCapacity(){

    const result =
        document.getElementById(
            "storageCapacityResult"
        );

    if(!result){
        return;
    }

    result.textContent = "容量情報を確認中...";

    try{

        const info =
            await getStorageCapacityInfo();

        const browser = info.browser;
        const local = info.localStorage;

        const usage =
            formatStorageSize(browser.usage);

        const quota =
            formatStorageSize(browser.quota);

        const localUsage =
            formatStorageSize(local.bytes);

        let warningText = "容量情報を取得できません";

        if(info.warning === "safe"){
            warningText = "🟢 保存容量に余裕があります";
        }

        if(info.warning === "warning"){
            warningText = "🟡 保存容量が少なくなっています";
        }

        if(info.warning === "danger"){
            warningText = "🔴 保存容量に注意が必要です";
        }

        result.innerHTML = `

            <div>
                <strong>ブラウザの使用量</strong>
                <p>${usage}</p>
            </div>

            <div>
                <strong>保存容量の目安</strong>
                <p>${quota}</p>
            </div>

            <div>
                <strong>localStorage使用量</strong>
                <p>${localUsage}</p>
            </div>

            <hr>

            <p>${warningText}</p>

        `;

    }catch(error){

        console.error(
            "容量表示エラー",
            error
        );

        result.textContent =
            "容量情報を取得できませんでした。";

    }

}