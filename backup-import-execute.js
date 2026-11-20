
/* =========================================================
   推し活手帳
   安全なバックアップ取り込み実行
   既存データは上書き・削除しない
========================================================= */

(function(){
"use strict";

const DB_NAME = "oshi_app_media";
const DB_VERSION = 1;
const STORE_NAME = "media";
const MAIN_KEY = "oshi_app_data";


/* =========================================================
   JSON比較
========================================================= */

function toJSON(value){
    return JSON.stringify(value);
}

function readCurrentMainData(){

    const raw = localStorage.getItem(MAIN_KEY);

    if(raw === null){
        throw new Error("PCのメインデータが見つかりません。");
    }

    let data;

    try{
        data = JSON.parse(raw);
    }catch(error){
        throw new Error("PCのメインデータを読み取れません。");
    }

    if(!data || typeof data !== "object" || Array.isArray(data)){
        throw new Error("PCのメインデータ形式が正しくありません。");
    }

    return data;
}


/* =========================================================
   取り込み前のPCデータが変化していないか確認
========================================================= */

function assertMainDataUnchanged(baseline){

    const current = readCurrentMainData();

    if(toJSON(current) !== baseline){
        throw new Error(
            "検査後にPCのメインデータが変更されています。安全のため取り込みを中止しました。"
        );
    }

    return current;
}


/* =========================================================
   IndexedDBを開く
   DBやストアの新規作成・変更はしない
========================================================= */

function openMediaDB(){

    return new Promise((resolve,reject)=>{

        const request = indexedDB.open(DB_NAME,DB_VERSION);

        request.onupgradeneeded = function(){

            request.transaction.abort();

            reject(new Error(
                "メディアDBの構成が想定と異なります。"
            ));

        };

        request.onsuccess = function(){

            const db = request.result;

            if(!db.objectStoreNames.contains(STORE_NAME)){
                db.close();
                reject(new Error(
                    "メディア保存領域が見つかりません。"
                ));
                return;
            }

            resolve(db);

        };

        request.onerror = function(){
            reject(request.error || new Error(
                "メディアDBを開けませんでした。"
            ));
        };

        request.onblocked = function(){
            reject(new Error(
                "メディアDBが別の処理で使用中です。"
            ));
        };

    });

}


/* =========================================================
   メディアを追加専用で取り込む
   put() は使わない
   既存IDは絶対に上書きしない
========================================================= */

async function addMediaWithoutOverwrite(records){

    if(!Array.isArray(records)){
        throw new Error("取り込みメディア一覧が正しくありません。");
    }

    for(const item of records){

        if(
            !item ||
            item.id === undefined ||
            item.id === null ||
            !(item.file instanceof Blob)
        ){
            throw new Error(
                "取り込み対象に不正なメディアがあります。"
            );
        }

    }

    const db = await openMediaDB();

    return new Promise((resolve,reject)=>{

        let transaction;

        try{
            transaction = db.transaction(STORE_NAME,"readwrite");
        }catch(error){
            db.close();
            reject(error);
            return;
        }

        const store = transaction.objectStore(STORE_NAME);

        let index = 0;
        let added = 0;
        let skipped = 0;
        let finished = false;

        function fail(error){

            if(finished) return;

            finished = true;

            try{
                transaction.abort();
            }catch(ignore){}

            db.close();

            reject(error instanceof Error ? error : new Error(
                "メディアの追加に失敗しました。"
            ));

        }

        function next(){

            if(finished) return;

            if(index >= records.length){
                return;
            }

            const item = records[index++];

            let getRequest;

            try{
                getRequest = store.get(item.id);
            }catch(error){
                fail(error);
                return;
            }

            getRequest.onsuccess = function(){

                if(getRequest.result){

                    /* 既存IDは変更せず、そのまま保留 */

                    skipped++;
                    next();
                    return;

                }

                let addRequest;

                try{

                    /* add() は既存IDを上書きしない */

                    addRequest = store.add(item);

                }catch(error){

                    fail(error);
                    return;

                }

                addRequest.onsuccess = function(){
                    added++;
                    next();
                };

                addRequest.onerror = function(event){

                    if(addRequest.error &&
                       addRequest.error.name === "ConstraintError"){

                        /* 重複IDはスキップ。既存データは変更しない */

                        event.preventDefault();
                        event.stopPropagation();

                        skipped++;
                        next();
                        return;

                    }

                    fail(addRequest.error || new Error(
                        "メディア追加エラー"
                    ));

                };

            };

            getRequest.onerror = function(){
                fail(getRequest.error || new Error(
                    "既存メディアの確認に失敗しました。"
                ));
            };

        }

        transaction.oncomplete = function(){

            if(finished) return;

            finished = true;
            db.close();

            resolve({
                added:added,
                skipped:skipped
            });

        };

        transaction.onerror = function(){

            if(finished) return;

            fail(transaction.error || new Error(
                "メディア保存処理に失敗しました。"
            ));

        };

        transaction.onabort = function(){

            if(finished) return;

            finished = true;
            db.close();

            reject(transaction.error || new Error(
                "メディア保存処理が中止されました。"
            ));

        };

        next();

    });

}


/* =========================================================
   メディアIDの保存後確認
========================================================= */

async function verifyMediaIds(expectedRecords){

    const db = await openMediaDB();

    return new Promise((resolve,reject)=>{

        let transaction;

        try{
            transaction = db.transaction(STORE_NAME,"readonly");
        }catch(error){
            db.close();
            reject(error);
            return;
        }

        const request =
            transaction.objectStore(STORE_NAME).getAllKeys();

        request.onsuccess = function(){

            const ids = new Set(
                request.result.map(String)
            );

            const missing = expectedRecords
                .filter(item => !ids.has(String(item.id)))
                .map(item => item.id);

            if(missing.length){
                reject(new Error(
                    "取り込み後に確認できないメディアがあります: " +
                    missing.length + "件"
                ));
                return;
            }

            resolve({
                checked:expectedRecords.length,
                missing:missing.length
            });

        };

        request.onerror = function(){
            reject(request.error || new Error(
                "メディア保存後の確認に失敗しました。"
            ));
        };

        transaction.oncomplete = function(){
            db.close();
        };

        transaction.onerror = function(){
            db.close();
        };

        transaction.onabort = function(){
            db.close();
        };

    });

}


/* =========================================================
   保護バックアップを保存して、保存後に再検査
========================================================= */

async function saveAndVerifySafetyBackup(){

    if(typeof window.showSaveFilePicker !== "function"){
        throw new Error(
            "このブラウザでは安全なファイル保存を確認できません。"
        );
    }

    /* クリック直後に保存先を選ぶ */

    const handle = await window.showSaveFilePicker({

        suggestedName:
            "推し活手帳_復元前保護バックアップ.zip",

        types:[{
            description:"推し活手帳 保護バックアップ",
            accept:{
                "application/zip":[".zip"]
            }
        }]

    });


    /* 最新のPCデータから保護ZIPを作成 */

    if(
        !window.BackupSafety ||
        typeof window.BackupSafety.createSafetyBackupFile !== "function"
    ){
        throw new Error(
            "保護バックアップ機能が見つかりません。"
        );
    }

    const safety =
        await window.BackupSafety.createSafetyBackupFile();

    if(
        !safety ||
        !(safety.file instanceof Blob) ||
        !safety.report ||
        safety.report.valid !== true
    ){
        throw new Error(
            "保護バックアップの作成・検査に失敗しました。"
        );
    }


    /* 選択した保存先へ書き込む */

    const writable = await handle.createWritable();

    try{

        await writable.write(safety.file);
        await writable.close();

    }catch(error){

        try{
            await writable.abort();
        }catch(ignore){}

        throw new Error(
            "保護バックアップを保存できませんでした: " +
            error.message
        );

    }


    /* 保存された実ファイルを読み直す */

    const savedFile = await handle.getFile();

    if(savedFile.size !== safety.file.size){
        throw new Error(
            "保存後の保護バックアップ容量が一致しません。"
        );
    }

    const checked =
        await window.BackupManager.inspectBackupFile(savedFile);

    if(
        !checked ||
        !checked.report ||
        checked.report.valid !== true
    ){
        throw new Error(
            "保存後の保護バックアップ再検査に失敗しました。"
        );
    }

    const report = checked.report;

    if(
        report.zipSize !== undefined &&
        report.zipSize !== savedFile.size
    ){
        throw new Error(
            "保存後のZIP容量検査に失敗しました。"
        );
    }

    if(
        report.mediaCount !== safety.report.mediaCount ||
        report.mediaSize !== safety.report.mediaSize ||
        report.zipEntryCount !== safety.report.zipEntryCount ||
        report.checkedCRCCount !== safety.report.checkedCRCCount
    ){
        throw new Error(
            "保存前後の保護バックアップ検査結果が一致しません。"
        );
    }

    return {
        fileName:savedFile.name,
        fileSize:savedFile.size,
        report:report
    };

}


/* =========================================================
   実行
========================================================= */

async function executeImport(preview){

    if(!preview){
        throw new Error(
            "スマホZIPの検査結果がありません。先にZIPを選択してください。"
        );
    }

    if(
        !window.BackupImportPlan ||
        typeof window.BackupImportPlan.createImportPlan !== "function"
    ){
        throw new Error(
            "取り込み計画機能が見つかりません。"
        );
    }

    /* 現在のPCデータを基準として記録 */

    const baselineData = readCurrentMainData();
    const baseline = toJSON(baselineData);


    /* 取り込み計画を最新の検査結果から作成 */

    const plan =
        await window.BackupImportPlan.createImportPlan(preview);

    if(
        !plan ||
        plan.mode !== "READ_ONLY_PLAN" ||
        !plan.mainDataCandidate ||
        !Array.isArray(plan.mediaAdd)
    ){
        throw new Error(
            "取り込み計画の形式が正しくありません。"
        );
    }

    if(plan.errors && plan.errors.length){
        throw new Error(
            "取り込み計画にエラーがあるため中止しました。"
        );
    }

    if(
        plan.localStorageAdd &&
        plan.localStorageAdd.length > 0
    ){
        throw new Error(
            "未確認のlocalStorage追加項目があるため中止しました。"
        );
    }


    /* 既存PCデータのトップレベル項目が残ることを確認 */

    for(const key of Object.keys(baselineData)){

        if(!Object.prototype.hasOwnProperty.call(
            plan.mainDataCandidate,key
        )){
            throw new Error(
                "PC既存データが取り込み候補から欠落しています: " + key
            );
        }

    }


    /* 競合・保留対象の重要データを変更していないことを確認 */

    const protectedKeys = [
        "memorialDays",
        "favoriteEvents",
        "favoritePhotos",
        "familySchedule",
        "money",
        "sportsCalendar",
        "healthCalendar"
    ];

    for(const key of protectedKeys){

        if(
            Object.prototype.hasOwnProperty.call(baselineData,key) &&
            toJSON(baselineData[key]) !==
            toJSON(plan.mainDataCandidate[key])
        ){
            throw new Error(
                "保護対象データが変更される計画のため中止しました: " + key
            );
        }

    }


    /* 保護バックアップの保存と再検査 */

    const safetyResult =
        await saveAndVerifySafetyBackup();


    /* 保護バックアップ作成中にPCデータが変わっていないか確認 */

    assertMainDataUnchanged(baseline);


    /* メディアを追加専用で取り込む */

    const mediaResult =
        await addMediaWithoutOverwrite(plan.mediaAdd);


    /* メディア追加中にPCのメインデータが変わっていないか再確認 */

    assertMainDataUnchanged(baseline);


    /* メインデータを追加候補で保存 */

    const candidateJSON =
        JSON.stringify(plan.mainDataCandidate);

    try{

        localStorage.setItem(MAIN_KEY,candidateJSON);

    }catch(error){

        throw new Error(
            "写真・動画の追加は完了しましたが、メインデータの保存に失敗しました。既存データは削除していません。原因: " +
            error.message
        );

    }


    /* メインデータ保存後の確認 */

    const savedMainData = readCurrentMainData();

    if(toJSON(savedMainData) !== toJSON(plan.mainDataCandidate)){
        throw new Error(
            "メインデータの保存後確認が一致しません。"
        );
    }


    /* メディア保存後の確認 */

    const mediaVerification =
        await verifyMediaIds(plan.mediaAdd);


    return {

        success:true,

        safetyBackup:safetyResult,

        mainData:{
            addedCandidates:plan.summary.mainDataAddCandidates,
            verified:true
        },

        media:{
            requested:plan.mediaAdd.length,
            added:mediaResult.added,
            skippedExisting:mediaResult.skipped,
            verified:mediaVerification.checked
        },

        held:plan.held,

        message:
            "取り込み処理と保存後確認が完了しました。"

    };

}


/* =========================================================
   公開
========================================================= */

window.BackupImportExecute = {
    executeImport
};

})();
