
/* =========================================================
   推し活手帳
   安全なバックアップ取り込み実行
   既存データは上書き・削除しない
   失敗時は今回追加したデータだけを巻き戻す
========================================================= */

(function(){
"use strict";

const DB_NAME = "oshi_app_media";
const DB_VERSION = 1;
const STORE_NAME = "media";
const MAIN_KEY = "oshi_app_data";

/* 今回の取り込み処理を識別する一時項目 */
const IMPORT_TOKEN_FIELD = "__backupImportToken";


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


/* =====================================================
   既存のお金データが保持されているか検査
===================================================== */

function assertExistingMoneyDataPreserved(current, candidate, path){

    const label = path || "money";

    /* 配列 */
    if(Array.isArray(current)){

        if(!Array.isArray(candidate)){
            throw new Error(
                label + "：既存の配列が失われています"
            );
        }

        if(candidate.length < current.length){
            throw new Error(
                label + "：既存データが減少しています"
            );
        }

        for(let i = 0; i < current.length; i++){

            assertExistingMoneyDataPreserved(
                current[i],
                candidate[i],
                label + "[" + i + "]"
            );

        }

        return;
    }


    /* オブジェクト */
    if(
        current !== null &&
        typeof current === "object"
    ){

        if(
            candidate === null ||
            typeof candidate !== "object" ||
            Array.isArray(candidate)
        ){

            throw new Error(
                label + "：既存のオブジェクト形式が変更されています"
            );

        }

        for(const key of Object.keys(current)){

            if(!Object.prototype.hasOwnProperty.call(candidate, key)){

                throw new Error(
                    label + "." + key +
                    "：既存の項目が失われています"
                );

            }

            assertExistingMoneyDataPreserved(
                current[key],
                candidate[key],
                label + "." + key
            );

        }

        return;
    }


    /* 文字列・数値・真偽値・null */
    if(!Object.is(current, candidate)){

        throw new Error(
            label + "：既存の値が変更されています"
        );

    }

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
   add() で追加する
   既存IDは絶対に上書きしない
   今回追加したデータには一時識別印を付ける
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

        /* 予約済み項目が元データにあれば中止 */

        if(
            Object.prototype.hasOwnProperty.call(
                item,
                IMPORT_TOKEN_FIELD
            )
        ){
            throw new Error(
                "取り込みメディアに予約済みの内部項目が含まれています。安全のため中止しました。"
            );
        }

    }


    const importToken =
        "backup-import-" +
        Date.now() + "-" +
        Math.random().toString(36).slice(2);


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
        const addedIds = [];
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

                    /* 既存IDは変更せず、そのままスキップ */

                    skipped++;
                    next();
                    return;

                }


                let addRequest;

                try{

                    /*
                       元のデータを複製し、
                       今回の取り込み処理だけを識別する印を付ける。

                       add() を使うため、
                       既存IDのデータは上書きされない。
                    */

                    const markedItem = {
                        ...item,
                        [IMPORT_TOKEN_FIELD]:importToken
                    };

                    addRequest = store.add(markedItem);

                }catch(error){

                    fail(error);
                    return;

                }


                addRequest.onsuccess = function(){

                    added++;
                    addedIds.push(item.id);
                    next();

                };


                addRequest.onerror = function(event){

                    if(
                        addRequest.error &&
                        addRequest.error.name === "ConstraintError"
                    ){

                        /* 重複IDはスキップ */

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
                skipped:skipped,
                addedIds:addedIds,
                importToken:importToken
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
   今回追加したメディアだけを取り消す
   IDと一時識別印の両方が一致した場合だけ削除
========================================================= */

async function rollbackAddedMedia(addedIds, importToken){

    if(!Array.isArray(addedIds) || addedIds.length === 0){
        return {
            success:true,
            removed:0,
            skipped:0
        };
    }

    if(!importToken){
        throw new Error("巻き戻し識別情報がありません。");
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
        let removed = 0;
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
                "追加メディアの巻き戻しに失敗しました。"
            ));

        }


        function next(){

            if(finished) return;

            if(index >= addedIds.length){
                return;
            }

            const id = addedIds[index++];


            let getRequest;

            try{
                getRequest = store.get(id);
            }catch(error){
                fail(error);
                return;
            }


            getRequest.onsuccess = function(){

                const current = getRequest.result;


                /* 既に存在しない場合は何もしない */

                if(!current){
                    skipped++;
                    next();
                    return;
                }


                /*
                   IDだけでは削除しない。
                   今回の取り込み処理の識別印も一致した場合だけ削除。
                */

                if(
                    current[IMPORT_TOKEN_FIELD] !== importToken
                ){
                    skipped++;
                    next();
                    return;
                }


                const deleteRequest = store.delete(id);

                deleteRequest.onsuccess = function(){
                    removed++;
                    next();
                };

                deleteRequest.onerror = function(){
                    fail(deleteRequest.error);
                };

            };


            getRequest.onerror = function(){
                fail(getRequest.error);
            };

        }


        transaction.oncomplete = function(){

            if(finished) return;

            finished = true;
            db.close();

            resolve({
                success:true,
                removed:removed,
                skipped:skipped
            });

        };


        transaction.onerror = function(){
            fail(transaction.error);
        };


        transaction.onabort = function(){

            if(finished) return;

            finished = true;
            db.close();

            reject(transaction.error || new Error(
                "追加メディアの巻き戻しが中止されました。"
            ));

        };


        next();

    });

}


/* =========================================================
   成功時に一時識別印を取り除く
   IDと識別印が一致するデータだけを更新
========================================================= */

async function finalizeAddedMedia(addedIds, importToken){

    if(!Array.isArray(addedIds) || addedIds.length === 0){
        return {
            success:true,
            finalized:0
        };
    }

    if(!importToken){
        throw new Error("一時識別印の確認情報がありません。");
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
        let finalized = 0;
        let finished = false;


        function fail(error){

            if(finished) return;

            finished = true;

            try{
                transaction.abort();
            }catch(ignore){}

            db.close();

            reject(error instanceof Error ? error : new Error(
                "一時識別印の解除に失敗しました。"
            ));

        }


        function next(){

            if(finished) return;

            if(index >= addedIds.length){
                return;
            }

            const id = addedIds[index++];


            let getRequest;

            try{
                getRequest = store.get(id);
            }catch(error){
                fail(error);
                return;
            }


            getRequest.onsuccess = function(){

                const current = getRequest.result;


                if(
                    !current ||
                    current[IMPORT_TOKEN_FIELD] !== importToken
                ){
                    fail(new Error(
                        "追加メディアの識別確認に失敗しました。"
                    ));
                    return;
                }


                /*
                   今回の識別印だけを取り除く。
                   それ以外のメディア内容は保持する。

                   put() は今回追加したデータの識別印解除に限って使用。
                   既存データの取り込み・上書きには使用しない。
                */

                delete current[IMPORT_TOKEN_FIELD];


                let putRequest;

                try{
                    putRequest = store.put(current);
                }catch(error){
                    fail(error);
                    return;
                }


                putRequest.onsuccess = function(){
                    finalized++;
                    next();
                };

                putRequest.onerror = function(){
                    fail(putRequest.error);
                };

            };


            getRequest.onerror = function(){
                fail(getRequest.error);
            };

        }


        transaction.oncomplete = function(){

            if(finished) return;

            finished = true;
            db.close();

            resolve({
                success:true,
                finalized:finalized
            });

        };


        transaction.onerror = function(){
            fail(transaction.error);
        };


        transaction.onabort = function(){

            if(finished) return;

            finished = true;
            db.close();

            reject(transaction.error || new Error(
                "一時識別印の解除が中止されました。"
            ));

        };


        next();

    });

}


/* =========================================================
   メインデータを取り込み前の状態へ戻す
   取り込み後に別の変更があれば上書きしない

   baselineRaw：
   取り込み前のlocalStorageの生文字列

   candidateJSON：
   今回保存しようとした取り込み候補
========================================================= */

function rollbackMainData(baselineRaw, candidateJSON){

    const current = localStorage.getItem(MAIN_KEY);


    /* まだ変更されていない場合 */

    if(current === baselineRaw){
        return {
            success:true,
            restored:false,
            message:"メインデータは変更前の状態のままです。"
        };
    }


    /*
       現在の内容が今回の取り込み候補と完全一致する場合だけ戻す。
       別の処理による変更があれば上書きしない。
    */

    if(current !== candidateJSON){

        return {
            success:false,
            restored:false,
            message:"メインデータが別の内容に変更されているため、安全のため自動復元を行いませんでした。"
        };

    }


    localStorage.setItem(MAIN_KEY, baselineRaw);


    if(localStorage.getItem(MAIN_KEY) !== baselineRaw){

        return {
            success:false,
            restored:false,
            message:"メインデータの復元後確認に失敗しました。"
        };

    }


    return {
        success:true,
        restored:true,
        message:"メインデータを取り込み前の状態に戻しました。"
    };

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


    /* 現在のPCデータを取得 */

    const baselineData = readCurrentMainData();

    /* JSON比較用 */
    const baseline = toJSON(baselineData);

    /* 復元用に生の文字列も保持 */
    const baselineRaw = localStorage.getItem(MAIN_KEY);

    if(baselineRaw === null){
        throw new Error(
            "PCのメインデータが見つかりません。"
        );
    }


    /* 取り込み計画を作成 */

    const plan =
        await window.BackupImportPlan.createImportPlan(preview);


    /* 取り込み計画の形式を確認 */

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


    /* 計画作成時のエラーがあれば中止 */

    if(plan.errors && plan.errors.length){
        throw new Error(
            "取り込み計画にエラーがあるため中止しました。"
        );
    }


    /* 未確認のlocalStorage追加があれば中止 */

    if(
        plan.localStorageAdd &&
        plan.localStorageAdd.length > 0
    ){
        throw new Error(
            "未確認のlocalStorage追加項目があるため中止しました。"
        );
    }


    /* =====================================================
       既存のお金データの保護

       ・既存データを削除しない
       ・既存データを上書きしない
       ・新規データの追加は許可
    ===================================================== */

    if(
        Object.prototype.hasOwnProperty.call(
            baselineData,
            "money"
        )
    ){

        if(
            !Object.prototype.hasOwnProperty.call(
                plan.mainDataCandidate,
                "money"
            )
        ){
            throw new Error(
                "取り込み計画で既存のお金データが失われています"
            );
        }


        assertExistingMoneyDataPreserved(
            baselineData.money,
            plan.mainDataCandidate.money,
            "money"
        );

    }


    /* =====================================================
       家族予定の既存データ保護

       ・既存メンバーを保持
       ・既存予定を保持
       ・既存繰り返しルールを保持
       ・既存例外を保持
       ・既存データの上書き・削除を防止
       ・新規データの追加は許可
    ===================================================== */

    if(
        Object.prototype.hasOwnProperty.call(
            baselineData,
            "familySchedule"
        )
    ){

        if(
            !Object.prototype.hasOwnProperty.call(
                plan.mainDataCandidate,
                "familySchedule"
            )
        ){
            throw new Error(
                "取り込み計画で既存の家族予定データが失われています"
            );
        }


        assertExistingMoneyDataPreserved(
            baselineData.familySchedule,
            plan.mainDataCandidate.familySchedule,
            "familySchedule"
        );

    }


    /* 既存PCデータのトップレベル項目が残ることを確認 */

    for(const key of Object.keys(baselineData)){

        if(!Object.prototype.hasOwnProperty.call(
            plan.mainDataCandidate,
            key
        )){
            throw new Error(
                "PC既存データが取り込み候補から欠落しています: " + key
            );
        }

    }


    /* =====================================================
       競合・保留対象の重要データを変更していないことを確認

       familyScheduleは上で個別に保護確認するため、
       ここでは追加取り込みを許可する。
    ===================================================== */

    const protectedKeys = [
        "memorialDays",
        "favoriteEvents",
        "favoritePhotos",
        "sportsCalendar",
        "healthCalendar"
    ];


    for(const key of protectedKeys){

        if(
            Object.prototype.hasOwnProperty.call(
                baselineData,
                key
            ) &&
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


    /* ここから変更処理 */

    let mediaResult = null;
    let candidateJSON = null;
    let mainDataWriteAttempted = false;


    try{

        /* メディアを追加専用で取り込む */

        mediaResult =
            await addMediaWithoutOverwrite(plan.mediaAdd);


        /* メディア追加中にPCのメインデータが変わっていないか確認 */

        assertMainDataUnchanged(baseline);


        /* メインデータを追加候補で保存 */

        candidateJSON =
            JSON.stringify(plan.mainDataCandidate);

        mainDataWriteAttempted = true;

        localStorage.setItem(MAIN_KEY,candidateJSON);


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


        /*
           すべての保存後確認が終わった後、
           今回追加したメディアの一時識別印を取り除く。

           この処理が失敗した場合はcatchで巻き戻す。
        */

        const finalizeResult =
            await finalizeAddedMedia(
                mediaResult.addedIds,
                mediaResult.importToken
            );


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
                verified:mediaVerification.checked,
                finalized:finalizeResult.finalized
            },

            held:plan.held,

            message:
                "取り込み処理と保存後確認が完了しました。"

        };

    }catch(error){

        const rollbackResults = [];


        /* メインデータを書き換えようとした場合 */

        if(mainDataWriteAttempted){

            try{

                const mainRollback =
                    rollbackMainData(baselineRaw,candidateJSON);


                rollbackResults.push(
                    "メインデータ：" + mainRollback.message
                );


                if(!mainRollback.success){
                    rollbackResults.push(
                        "メインデータの自動復元は完了していません。"
                    );
                }

            }catch(rollbackError){

                rollbackResults.push(
                    "メインデータの復元失敗：" +
                    rollbackError.message
                );

            }

        }


        /* 今回追加したメディアだけを識別印付きで取り消す */

        if(mediaResult && Array.isArray(mediaResult.addedIds)){

            try{

                const mediaRollback =
                    await rollbackAddedMedia(
                        mediaResult.addedIds,
                        mediaResult.importToken
                    );


                rollbackResults.push(
                    "写真・動画：" +
                    mediaRollback.removed +
                    "件を取り消しました。" +
                    (
                        mediaRollback.skipped
                            ? "（安全確認のため対象外：" +
                              mediaRollback.skipped + "件）"
                            : ""
                    )
                );

            }catch(rollbackError){

                rollbackResults.push(
                    "写真・動画の巻き戻し失敗：" +
                    rollbackError.message
                );

            }

        }


        const detail = rollbackResults.length
            ? "\n\n【巻き戻し結果】\n" +
              rollbackResults.join("\n")
            : "\n\n【巻き戻し結果】\n変更処理前のため、取り消すデータはありません。";


        throw new Error(
            "取り込み処理を完了できませんでした。\n" +
            "原因：" + error.message +
            detail +
            "\n\n保護バックアップ：" +
            safetyResult.fileName
        );

    }

}



/* =========================================================
   公開
========================================================= */

window.BackupImportExecute = {
    executeImport
};

})();
