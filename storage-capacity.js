
/* =====================================================
   💾 保存容量・データ管理
   storage-capacity.js

   ・ブラウザ全体の保存容量を取得
   ・localStorage の使用量と内訳を取得
   ・oshi_app_data の項目別容量を推定
   ・IndexedDB の保存データを調査
   ・容量不足の警告を表示

   ※ 保存データの追加・変更・削除は行わない
===================================================== */


/* =====================================================
   1. 共通
===================================================== */

function formatStorageSize(bytes){

    if(typeof bytes !== "number" || !Number.isFinite(bytes)){
        return "取得できません";
    }

    if(bytes < 1024){
        return bytes + " B";
    }

    if(bytes < 1024 * 1024){
        return (bytes / 1024).toFixed(1) + " KB";
    }

    if(bytes < 1024 * 1024 * 1024){
        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";

}


function storageCapacityEscape(value){

    return String(value ?? "").replace(/[&<>"']/g, char => {

        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char];

    });

}


function getStorageWarningLevel(usage, quota){

    if(
        typeof usage !== "number" ||
        typeof quota !== "number" ||
        quota <= 0
    ){
        return "unknown";
    }

    const ratio = usage / quota;

    if(ratio >= 0.90) return "danger";
    if(ratio >= 0.75) return "warning";

    return "safe";

}


function getStorageWarningText(level){

    if(level === "danger"){
        return "🔴 保存容量が不足する可能性があります";
    }

    if(level === "warning"){
        return "🟡 保存容量が少なくなっています";
    }

    if(level === "safe"){
        return "🟢 保存容量に余裕があります";
    }

    return "⚪ 保存容量の状態を判定できません";

}


function getStorageWarningColor(level){

    if(level === "danger") return "#dc2626";
    if(level === "warning") return "#d97706";
    if(level === "safe") return "#16a34a";

    return "#888888";

}


/* =====================================================
   2. localStorage の内訳
===================================================== */

const STORAGE_KEY_LABELS = {

    "oshi_app_data": {
        name: "アプリのメインデータ",
        description: "予定・推し・お金・設定など"
    },

    "oshi_app_children": {
        name: "家族・子ども関連データ",
        description: "家族・子ども関連の保存情報"
    },

    "oshi_app_children_selected": {
        name: "選択中の家族情報",
        description: "現在選択している家族の情報"
    },

    "anniversary_color_history": {
        name: "記念日カラー履歴",
        description: "記念日表示に関するカラー情報"
    },

    "oshi_notification_history": {
        name: "通知履歴",
        description: "通知に関する履歴"
    },

    "favoriteMovieSort": {
        name: "お気に入り動画の並び順",
        description: "動画表示の並び順設定"
    },

    "calendarMovieSort": {
        name: "カレンダー動画の並び順",
        description: "動画表示の並び順設定"
    },

    "favoritePhotoSort": {
        name: "お気に入り写真の並び順",
        description: "写真表示の並び順設定"
    },

    "calendarPhotoSort": {
        name: "カレンダー写真の並び順",
        description: "写真表示の並び順設定"
    },

    "theme": {
        name: "背景テーマ",
        description: "アプリ全体のテーマ設定"
    },

    "oshi_last_page": {
        name: "最後に開いたページ",
        description: "次回起動時の表示ページ"
    },

    "oshi_last_planner_date": {
        name: "最後に開いた手帳の日付",
        description: "1日手帳の日付"
    }

};


function getLocalStorageUsage(){

    let totalBytes = 0;
    const items = [];

    try{

        for(let i = 0; i < localStorage.length; i++){

            const key = localStorage.key(i);
            const value = localStorage.getItem(key);

            if(key === null) continue;

            const bytes =
                new Blob([key, value ?? ""]).size;

            totalBytes += bytes;

            const info = STORAGE_KEY_LABELS[key] || {

                name: key,

                description: "アプリ内で使用されている保存データ"

            };

            items.push({

                key: key,

                name: info.name,

                description: info.description,

                bytes: bytes

            });

        }

    }catch(error){

        console.warn(
            "localStorage容量の取得に失敗しました",
            error
        );

    }

    items.sort((a, b) => b.bytes - a.bytes);

    return {

        bytes: totalBytes,

        kilobytes: totalBytes / 1024,

        megabytes: totalBytes / (1024 * 1024),

        items: items

    };

}


/* =====================================================
   3. メインデータの内訳
===================================================== */

const STORAGE_DATA_LABELS = {

    events: "予定・スケジュール",

    oshis: "推し情報",

    oshiDetails: "推しの詳細情報",

    money: "家計・推し活のお金",

    settings: "アプリ設定",

    familySchedule: "家族スケジュール",

    categories: "予定カテゴリ",

    templates: "持ち物テンプレート",

    anniversaries: "記念日・誕生日",

    health: "健康関連データ",

    sports: "スポーツ関連データ",

    games: "試合関連データ",

    children: "家族・子ども関連データ"

};


function getMainDataBreakdown(){

    const result = [];

    try{

        const raw = localStorage.getItem("oshi_app_data");

        if(!raw){

            return result;

        }

        const data = JSON.parse(raw);

        if(
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ){

            return result;

        }

        Object.keys(data).forEach(key => {

            let json = "";

            try{

                json = JSON.stringify(data[key]);

            }catch(error){

                json = "";

            }

            const bytes =
                new Blob([json || ""]).size;

            result.push({

                key: key,

                name:
                    STORAGE_DATA_LABELS[key] || key,

                bytes: bytes

            });

        });

    }catch(error){

        console.warn(
            "メインデータの内訳取得に失敗しました",
            error
        );

    }

    result.sort((a, b) => b.bytes - a.bytes);

    return result;

}


/* =====================================================
   4. ブラウザ全体の保存容量
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
   5. IndexedDB の容量調査

   ※既存データベースを読み取り専用で確認
===================================================== */

function measureStoredValue(value, seen){

    if(value === null || value === undefined){
        return 0;
    }

    if(typeof value === "string"){
        return new Blob([value]).size;
    }

    if(typeof value === "number"){
        return 8;
    }

    if(typeof value === "boolean"){
        return 1;
    }

    if(typeof value !== "object"){
        return 0;
    }

    if(seen.has(value)){
        return 0;
    }

    seen.add(value);

    if(value instanceof Blob){
        return value.size;
    }

    if(value instanceof ArrayBuffer){
        return value.byteLength;
    }

    if(ArrayBuffer.isView(value)){
        return value.byteLength;
    }

    let total = 0;

    if(Array.isArray(value)){

        value.forEach(item => {

            total += measureStoredValue(item, seen);

        });

        return total;

    }

    Object.keys(value).forEach(key => {

        total += new Blob([key]).size;

        total += measureStoredValue(
            value[key],
            seen
        );

    });

    return total;

}


async function getIndexedDBMediaInfo(){

    const result = {

        supported: false,

        found: false,

        databaseName: "oshi_app_media",

        stores: [],

        count: 0,

        bytes: null,

        error: null

    };

    if(
        !window.indexedDB ||
        typeof indexedDB.databases !== "function"
    ){

        result.error =
            "このブラウザではデータベース一覧を取得できません";

        return result;

    }

    try{

        const databases =
            await indexedDB.databases();

        const exists = databases.some(db => {

            return db.name === "oshi_app_media";

        });

        result.supported = true;

        if(!exists){

            result.error =
                "写真・動画用データベースが見つかりません";

            return result;

        }

        result.found = true;

        const db = await new Promise((resolve, reject) => {

            const request =
                indexedDB.open("oshi_app_media");

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };

        });

        const storeNames =
            Array.from(db.objectStoreNames);

        let totalBytes = 0;
        let totalCount = 0;

        for(const storeName of storeNames){

            const storeResult = await new Promise(resolve => {

                let count = 0;
                let bytes = 0;

                try{

                    const transaction =
                        db.transaction(
                            storeName,
                            "readonly"
                        );

                    const store =
                        transaction.objectStore(storeName);

                    const request = store.openCursor();

                    request.onsuccess = event => {

                        const cursor = event.target.result;

                        if(cursor){

                            count++;

                            bytes += measureStoredValue(
                                cursor.value,
                                new WeakSet()
                            );

                            cursor.continue();

                        }

                    };

                    request.onerror = () => {

                        resolve({

                            count: count,

                            bytes: null

                        });

                    };

                    transaction.oncomplete = () => {

                        resolve({

                            count: count,

                            bytes: bytes

                        });

                    };

                    transaction.onerror = () => {

                        resolve({

                            count: count,

                            bytes: null

                        });

                    };

                }catch(error){

                    resolve({

                        count: 0,

                        bytes: null

                    });

                }

            });

            result.stores.push({

                name: storeName,

                count: storeResult.count,

                bytes: storeResult.bytes

            });

            totalCount += storeResult.count;

            if(typeof storeResult.bytes === "number"){

                totalBytes += storeResult.bytes;

            }

        }

        result.count = totalCount;

        result.bytes = totalBytes;

        db.close();

    }catch(error){

        console.warn(
            "IndexedDB容量の取得に失敗しました",
            error
        );

        result.error =
            "IndexedDBの詳細を取得できませんでした";

    }

    return result;

}


/* =====================================================
   6. 容量情報をまとめて取得
===================================================== */

async function getStorageCapacityInfo(){

    const local = getLocalStorageUsage();

    const mainData = getMainDataBreakdown();

    const browser =
        await getBrowserStorageEstimate();

    const media =
        await getIndexedDBMediaInfo();

    const warning =
        getStorageWarningLevel(
            browser.usage,
            browser.quota
        );

    const details = browser.usageDetails || {};

    return {

        localStorage: local,

        mainData: mainData,

        indexedDB: {

            estimate:
                details.indexedDB ?? null,

            media: media

        },

        browser: browser,

        warning: warning,

        checkedAt: new Date().toISOString()

    };

}


/* =====================================================
   7. 動作確認用
===================================================== */

async function testStorageCapacity(){

    const info =
        await getStorageCapacityInfo();

    console.log(
        "保存容量チェック結果",
        info
    );

    return info;

}


/* =====================================================
   8. 内訳表示の開閉
===================================================== */

function toggleStorageCapacityDetail(id){

    const target =
        document.getElementById(id);

    if(!target) return;

    target.style.display =
        target.style.display === "none"
            ? "block"
            : "none";

}


/* =====================================================
   9. 内訳HTML作成
===================================================== */

function createStorageDetailButton(id, label){

    return `

        <button
            type="button"
            onclick="toggleStorageCapacityDetail('${id}')"
            style="
                width:100%;
                margin-top:8px;
                padding:10px;
            ">

            📂 ${label}

        </button>

    `;

}


function createStorageDetailRow(name, description, bytes){

    return `

        <div style="
            padding:10px 0;
            border-bottom:1px solid #ddd;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                gap:8px;
                flex-wrap:wrap;
            ">

                <strong>
                    ${storageCapacityEscape(name)}
                </strong>

                <strong>
                    ${formatStorageSize(bytes)}
                </strong>

            </div>

            <small style="color:#777;">
                ${storageCapacityEscape(description || "")}
            </small>

        </div>

    `;

}


function createStorageProgress(
    title,
    bytes,
    maximum,
    note,
    status
){

    const hasMaximum =
        typeof maximum === "number" &&
        maximum > 0;

    const percent = hasMaximum
        ? Math.min(100, bytes / maximum * 100)
        : 0;

    const color =
        getStorageWarningColor(status);

    return `

        <div style="margin:16px 0;">

            <strong>${title}</strong>

            <div style="
                font-size:22px;
                font-weight:bold;
                margin:6px 0;
            ">

                ${formatStorageSize(bytes)}

            </div>

            <div style="
                width:100%;
                height:12px;
                background:#e5e5e5;
                border-radius:20px;
                overflow:hidden;
            ">

                <div style="
                    width:${percent}%;
                    height:100%;
                    background:${color};
                    border-radius:20px;
                "></div>

            </div>

            <div style="
                font-size:12px;
                color:#777;
                margin-top:6px;
            ">

                ${note}

            </div>

        </div>

    `;

}


/* =====================================================
   10. localStorage 内訳表示
===================================================== */

function createLocalStorageDetails(info){

    const items = info.localStorage.items;

    let html = "";

    if(items.length === 0){

        html = "<p>保存データはありません。</p>";

    }

    items.forEach(item => {

        html += createStorageDetailRow(

            item.name,

            item.description,

            item.bytes

        );

        if(item.key === "oshi_app_data"){

            const mainItems =
                info.mainData;

            if(mainItems.length){

                html += `

                    <div style="
                        margin:10px 0 10px 12px;
                        padding-left:10px;
                        border-left:3px solid #aaa;
                    ">

                        <strong>
                            メインデータの内訳
                        </strong>

                `;

                mainItems.forEach(data => {

                    html += createStorageDetailRow(

                        data.name,

                        "oshi_app_data 内の保存データ",

                        data.bytes

                    );

                });

                html += "</div>";

            }

        }

    });

    return html;

}


/* =====================================================
   11. IndexedDB 内訳表示
===================================================== */

function createIndexedDBDetails(info){

    const media = info.indexedDB.media;

    let html = "";

    if(!media.supported){

        return `

            <p>
                ${storageCapacityEscape(media.error)}
            </p>

        `;

    }

    if(!media.found){

        return `

            <p>
                ${storageCapacityEscape(media.error)}
            </p>

        `;

    }

    html += `

        <p>
            写真・動画などのメディア保存用データベース
        </p>

        <p>
            保存件数：
            <strong>${media.count} 件</strong>
        </p>

        <p>
            データの推定サイズ：
            <strong>${formatStorageSize(media.bytes)}</strong>
        </p>

    `;

    media.stores.forEach(store => {

        html += createStorageDetailRow(

            store.name,

            "IndexedDBの保存領域",

            store.bytes

        );

        html += `

            <small style="color:#777;">
                保存件数：${store.count} 件
            </small>

        `;

    });

    html += `

        <p style="font-size:12px;color:#777;">
            ※データベース内の値を読み取った推定サイズです。
            ブラウザが管理する実際の使用量とは異なる場合があります。
        </p>

    `;

    return html;

}


/* =====================================================
   12. 設定画面への容量表示
===================================================== */

async function refreshStorageCapacity(){

    const result =
        document.getElementById(
            "storageCapacityResult"
        );

    if(!result) return;

    result.textContent =
        "容量情報を確認中...";

    try{

        const info =
            await getStorageCapacityInfo();

        const browser = info.browser;
        const local = info.localStorage;

        const usage = browser.usage;
        const quota = browser.quota;

        const remaining =
            typeof usage === "number" &&
            typeof quota === "number"
                ? Math.max(0, quota - usage)
                : null;

        const warning = info.warning;

        let overallHtml = "";

        if(
            typeof usage === "number" &&
            typeof quota === "number"
        ){

            const percent =
                Math.min(100, usage / quota * 100);

            overallHtml = `

                <div style="
                    font-size:26px;
                    font-weight:bold;
                    margin:8px 0;
                ">

                    ${percent.toFixed(1)}% 使用中

                </div>

                ${createStorageProgress(

                    "ブラウザ全体の使用量",

                    usage,

                    quota,

                    "使用量：" +
                    formatStorageSize(usage) +
                    " ／ 最大容量の目安：" +
                    formatStorageSize(quota),

                    warning

                )}

                <p>
                    残り容量の目安：
                    <strong>
                        ${formatStorageSize(remaining)}
                    </strong>
                </p>

            `;

        }else{

            overallHtml = `

                <p>
                    ブラウザ全体の容量情報を取得できませんでした。
                </p>

                <p>
                    使用量：
                    ${formatStorageSize(usage)}
                </p>

                <p>
                    最大容量：
                    ${formatStorageSize(quota)}
                </p>

            `;

        }


        /* localStorage */

        const localHtml = `

            <h4>📋 localStorage</h4>

            <div style="
                font-size:22px;
                font-weight:bold;
            ">

                ${formatStorageSize(local.bytes)}

            </div>

            <p style="font-size:12px;color:#777;">
                個別の最大容量はブラウザから取得できません。
            </p>

            ${createStorageDetailButton(

                "storageLocalDetails",

                "localStorageの内訳を見る"

            )}

            <div
                id="storageLocalDetails"
                style="display:none;margin-top:10px;">

                ${createLocalStorageDetails(info)}

            </div>

        `;


        /* IndexedDB */

        const media = info.indexedDB.media;

        const indexedEstimate =
            info.indexedDB.estimate;

        let indexedUsageText =
            typeof indexedEstimate === "number"
                ? formatStorageSize(indexedEstimate)
                : "取得できません";

        let mediaUsageText =
            typeof media.bytes === "number"
                ? formatStorageSize(media.bytes)
                : "取得できません";

        const indexedHtml = `

            <h4>🖼 IndexedDB</h4>

            <div style="
                font-size:22px;
                font-weight:bold;
            ">

                ${indexedUsageText}

            </div>

            <p style="font-size:12px;color:#777;">
                ブラウザ全体のIndexedDB使用量の目安
            </p>

            <p>
                アプリの写真・動画データ：
                <strong>${mediaUsageText}</strong>
            </p>

            <p style="font-size:12px;color:#777;">
                個別の最大容量は取得できない場合があります。
            </p>

            ${createStorageDetailButton(

                "storageIndexedDBDetails",

                "IndexedDBの内訳を見る"

            )}

            <div
                id="storageIndexedDBDetails"
                style="display:none;margin-top:10px;">

                ${createIndexedDBDetails(info)}

            </div>

        `;


        /* 対応が必要な場所 */

        let actionText = "";

        if(warning === "danger"){

            actionText = `
                <p style="color:#dc2626;font-weight:bold;">
                    🔴 ブラウザ全体の保存容量が不足する可能性があります。
                    保存データの整理を検討してください。
                </p>
            `;

        }else if(warning === "warning"){

            actionText = `
                <p style="color:#d97706;font-weight:bold;">
                    🟡 ブラウザ全体の保存容量が少なくなっています。
                    使用量の大きい保存データを確認してください。
                </p>
            `;

        }else if(warning === "safe"){

            actionText = `
                <p style="color:#16a34a;font-weight:bold;">
                    🟢 現在、ブラウザ全体の保存容量には余裕があります。
                </p>
            `;

        }else{

            actionText = `
                <p>
                    ⚪ 容量不足の判定はできません。
                    各保存場所の使用量を確認してください。
                </p>
            `;

        }


        result.innerHTML = `

            <div style="
                padding:12px;
                border-radius:10px;
                background:rgba(128,128,128,0.08);
                margin-bottom:16px;
            ">

                <h3>💾 保存容量の状態</h3>

                <p style="
                    font-weight:bold;
                    color:${getStorageWarningColor(warning)};
                ">

                    ${getStorageWarningText(warning)}

                </p>

                ${overallHtml}

            </div>


            <div style="
                padding:12px;
                border:1px solid #ddd;
                border-radius:10px;
                margin-bottom:12px;
            ">

                ${localHtml}

            </div>


            <div style="
                padding:12px;
                border:1px solid #ddd;
                border-radius:10px;
                margin-bottom:12px;
            ">

                ${indexedHtml}

            </div>


            <div style="
                padding:12px;
                border-radius:10px;
                background:rgba(128,128,128,0.08);
            ">

                <h4>🔎 対応が必要な場所</h4>

                ${actionText}

                <p style="font-size:12px;color:#777;">
                    最終確認：
                    ${new Date(info.checkedAt).toLocaleString("ja-JP")}
                </p>

            </div>


            <p style="
                font-size:12px;
                color:#777;
                margin-top:12px;
            ">

                ※容量はブラウザによる推定値です。
                個別の保存場所の上限は取得できない場合があります。
                この機能は確認専用で、保存データの変更・削除は行いません。

            </p>

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
