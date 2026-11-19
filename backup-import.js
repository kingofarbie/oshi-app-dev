
/* =====================================================
   💾 安全なバックアップ取り込み準備
   backup-import.js

   第2版：
   ・推し一覧をID単位で比較
   ・推し詳細をoshiId単位で比較
   ・推し記録を記録ID単位で比較
   ・その他のメインDB項目は保留
   ・localStorageをキー単位で比較
   ・メディアをID単位で比較

   ※読み取り専用
   ※保存・追加・上書き・削除は行わない
===================================================== */

(function(){

"use strict";


/* =====================================================
   共通処理
===================================================== */

function hasOwn(object, key){
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value){
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function isSame(a, b){
    return JSON.stringify(a) === JSON.stringify(b);
}


/* =====================================================
   ID付き配列の比較
===================================================== */

function compareIdArray(backupItems, currentItems){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupItems)){
        result.invalid.push({
            reason: "バックアップ側が配列ではありません"
        });
        return result;
    }

    if(!Array.isArray(currentItems)){
        currentItems = [];
    }

    const currentMap = new Map();

    currentItems.forEach(item => {

        if(!item || item.id == null) return;

        const id = String(item.id);

        if(!currentMap.has(id)){
            currentMap.set(id, item);
        }

    });

    const backupIds = new Set();

    backupItems.forEach(item => {

        if(!item || item.id == null){

            result.invalid.push(item);
            return;

        }

        const id = String(item.id);

        if(backupIds.has(id)){

            result.invalid.push(item);
            return;

        }

        backupIds.add(id);

        if(!currentMap.has(id)){

            result.add.push(item);
            return;

        }

        const current = currentMap.get(id);

        if(isSame(item, current)){

            result.same.push(item);

        }else{

            result.conflict.push({
                id: id,
                backup: item,
                current: current
            });

        }

    });

    return result;

}


/* =====================================================
   オブジェクトキー単位の比較
===================================================== */

function compareObjectKeys(backupObject, currentObject){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(!isObject(backupObject)){

        result.invalid.push({
            reason: "バックアップ側がオブジェクトではありません"
        });

        return result;

    }

    if(!isObject(currentObject)){
        currentObject = {};
    }

    Object.entries(backupObject).forEach(([key, value]) => {

        if(!hasOwn(currentObject, key)){

            result.add.push({
                key: key,
                value: value
            });

        }else if(isSame(value, currentObject[key])){

            result.same.push({
                key: key,
                value: value
            });

        }else{

            result.conflict.push({
                key: key,
                backup: value,
                current: currentObject[key]
            });

        }

    });

    return result;

}


/* =====================================================
   推し記録の形式を解析
   外側の配列 → oshiId → 記録配列
===================================================== */

function flattenRecords(records){

    const result = [];
    const invalid = [];

    if(!Array.isArray(records)){
        return {
            items: result,
            invalid: [{
                reason: "推し記録が配列ではありません"
            }]
        };
    }

    records.forEach(group => {

        if(!isObject(group)){

            invalid.push(group);
            return;

        }

        Object.entries(group).forEach(([oshiId, items]) => {

            if(!Array.isArray(items)){

                invalid.push({
                    oshiId: oshiId,
                    value: items
                });

                return;

            }

            items.forEach(item => {

                if(!isObject(item)){

                    invalid.push(item);
                    return;

                }

                const normalized = {
                    ...item
                };

                if(
                    normalized.oshiId == null ||
                    normalized.oshiId === ""
                ){
                    normalized.oshiId = oshiId;
                }

                result.push(normalized);

            });

        });

    });

    return {
        items: result,
        invalid: invalid
    };

}


/* =====================================================
   推し記録のID比較
===================================================== */

function compareOshiRecords(backupRecords, currentRecords){

    const backup = flattenRecords(backupRecords);
    const current = flattenRecords(currentRecords);

    const result = compareIdArray(
        backup.items,
        current.items
    );

    result.invalid.push(
        ...backup.invalid
    );

    result.currentInvalid = current.invalid;

    return result;

}


/* =====================================================
   メインDBの個別比較
===================================================== */

function compareMainData(backupData){

    const currentRaw =
        localStorage.getItem("oshi_app_data");

    if(currentRaw === null){

        return {
            status: "current-data-missing",
            oshiList: null,
            oshiDetails: null,
            oshiRecords: null,
            held: [],
            invalid: []
        };

    }

    let currentData;

    try{

        currentData = JSON.parse(currentRaw);

    }catch(error){

        throw new Error(
            "現在のPCメインデータを解析できません。"
        );

    }

    if(!isObject(backupData.mainData)){

        throw new Error(
            "スマホ側メインデータの形式が正しくありません。"
        );

    }

    const backupMain = backupData.mainData;

    const result = {

        status: "read-only-comparison",

        oshiList: null,
        oshiDetails: null,
        oshiRecords: null,

        held: [],
        invalid: []

    };


    /* 推し一覧 */

    if(hasOwn(backupMain, "oshiList")){

        result.oshiList = compareIdArray(
            backupMain.oshiList,
            currentData.oshiList
        );

    }


    /* 推し詳細 */

    if(hasOwn(backupMain, "oshiDetails")){

        result.oshiDetails = compareObjectKeys(
            backupMain.oshiDetails,
            currentData.oshiDetails
        );

    }


    /* 推し記録 */

    if(hasOwn(backupMain, "oshiRecords")){

        result.oshiRecords = compareOshiRecords(
            backupMain.oshiRecords,
            currentData.oshiRecords
        );

    }


    /* 未確認のデータは安全のため保留 */

    const knownKeys = [
        "oshiList",
        "oshiDetails",
        "oshiRecords"
    ];

    Object.entries(backupMain).forEach(([key, value]) => {

        if(knownKeys.includes(key)) return;

        result.held.push({
            key: key,
            value: value,
            reason: "データ構造と安全な統合方法が未確認"
        });

    });

    return result;

}


/* =====================================================
   localStorage比較
===================================================== */

function compareLocalStorage(backupStorage){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    Object.entries(backupStorage || {})
        .forEach(([key, item]) => {

            if(!item || typeof item !== "object"){

                result.invalid.push(key);
                return;

            }

            if(item.exists === false) return;

            if(key === "oshi_app_data"){

                result.invalid.push({
                    key: key,
                    reason: "メインDBは専用比較を使用"
                });

                return;

            }

            const currentRaw =
                localStorage.getItem(key);

            if(currentRaw === null){

                result.add.push({
                    key: key,
                    value: item.value
                });

                return;

            }

            let currentValue;

            try{

                currentValue = JSON.parse(currentRaw);

            }catch(error){

                currentValue = currentRaw;

            }

            if(isSame(item.value, currentValue)){

                result.same.push(key);

            }else{

                result.conflict.push({
                    key: key,
                    backup: item.value,
                    current: currentValue
                });

            }

        });

    return result;

}


/* =====================================================
   メディア比較
===================================================== */

async function compareMedia(backupMedia){

    const result = {
        add: [],
        sameId: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupMedia)){
        result.invalid.push({
            reason: "メディア一覧が配列ではありません"
        });
        return result;
    }

    if(typeof getAllMediaFiles !== "function"){

        throw new Error(
            "既存メディア取得機能が見つかりません。"
        );

    }

    const currentMedia = await getAllMediaFiles();

    const currentMap = new Map();

    currentMedia.forEach(item => {

        if(item && item.id != null){

            currentMap.set(
                String(item.id),
                item
            );

        }

    });

    const backupIds = new Set();

    for(const item of backupMedia){

        if(
            !item ||
            item.id == null ||
            !(item.file instanceof Blob)
        ){

            result.invalid.push(item);
            continue;

        }

        const id = String(item.id);

        if(backupIds.has(id)){

            result.invalid.push(item);
            continue;

        }

        backupIds.add(id);

        if(!currentMap.has(id)){

            result.add.push(item);
            continue;

        }

        /* 同じIDは内容を未検証のため保留 */

        result.sameId.push({
            id: id,
            backup: item,
            current: currentMap.get(id)
        });

    }

    return result;

}


/* =====================================================
   取り込み予定の作成
===================================================== */

async function createImportPreview(backupData){

    if(
        !backupData ||
        backupData.format !== "oshi-app-restore-data"
    ){

        throw new Error(
            "取り込み用データの形式が正しくありません。"
        );

    }

    const mainData =
        compareMainData(backupData);

    const localStorageResult =
        compareLocalStorage(backupData.localStorage);

    const media =
        await compareMedia(backupData.media);


    const count = {

        oshiListAdd:
            mainData.oshiList
                ? mainData.oshiList.add.length
                : 0,

        oshiListSame:
            mainData.oshiList
                ? mainData.oshiList.same.length
                : 0,

        oshiListConflict:
            mainData.oshiList
                ? mainData.oshiList.conflict.length
                : 0,

        oshiDetailsAdd:
            mainData.oshiDetails
                ? mainData.oshiDetails.add.length
                : 0,

        oshiDetailsSame:
            mainData.oshiDetails
                ? mainData.oshiDetails.same.length
                : 0,

        oshiDetailsConflict:
            mainData.oshiDetails
                ? mainData.oshiDetails.conflict.length
                : 0,

        oshiRecordsAdd:
            mainData.oshiRecords
                ? mainData.oshiRecords.add.length
                : 0,

        oshiRecordsSame:
            mainData.oshiRecords
                ? mainData.oshiRecords.same.length
                : 0,

        oshiRecordsConflict:
            mainData.oshiRecords
                ? mainData.oshiRecords.conflict.length
                : 0,

        mainDataHeld:
            mainData.held.length,

        mainDataInvalid:
            mainData.invalid.length,

        localStorageAdd:
            localStorageResult.add.length,

        localStorageSame:
            localStorageResult.same.length,

        localStorageConflict:
            localStorageResult.conflict.length,

        mediaAdd:
            media.add.length,

        mediaSameIdHeld:
            media.sameId.length,

        mediaInvalid:
            media.invalid.length

    };


    return {

        createdAt: new Date().toISOString(),

        mode: "READ_ONLY",

        mainData: mainData,

        localStorage: localStorageResult,

        media: media,

        summary: count

    };

}


/* =====================================================
   公開
===================================================== */

window.BackupImport = {

    createImportPreview:
        createImportPreview

};

})();
