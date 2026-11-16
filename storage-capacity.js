
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