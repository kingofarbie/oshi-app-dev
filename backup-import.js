
/* =====================================================
   💾 安全なバックアップ取り込み準備
   backup-import.js

   第1版：
   ・取り込み予定の作成
   ・既存データとの照合
   ・追加可能 / 一致 / 競合の分類

   ※このファイルは読み取り専用
   ※保存・追加・上書き・削除は行わない
===================================================== */

(function(){

"use strict";

function hasOwn(object, key){
    return Object.prototype.hasOwnProperty.call(object, key);
}

function toJson(value){
    return JSON.stringify(value);
}

function isSame(a, b){
    return toJson(a) === toJson(b);
}


/* =====================================================
   1. ID付き配列の比較
===================================================== */

function compareIdArray(backupItems, currentItems){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupItems)){
        return result;
    }

    if(!Array.isArray(currentItems)){
        currentItems = [];
    }

    const currentMap = new Map();

    currentItems.forEach(item => {

        if(!item || item.id == null){
            return;
        }

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
   2. オブジェクトキー単位の比較
===================================================== */

function compareObjectKeys(backupObject, currentObject){

    const result = {
        add: [],
        same: [],
        conflict: [],
        invalid: []
    };

    if(
        !backupObject ||
        typeof backupObject !== "object" ||
        Array.isArray(backupObject)
    ){
        return result;
    }

    if(
        !currentObject ||
        typeof currentObject !== "object" ||
        Array.isArray(currentObject)
    ){
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
   3. localStorage比較
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

            if(
                !item ||
                typeof item !== "object"
            ){
                result.invalid.push(key);
                return;
            }

            if(item.exists === false){
                return;
            }

            const currentRaw = localStorage.getItem(key);

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
   4. メインDB比較
===================================================== */

function compareMainData(backupData){

    const currentRaw =
        localStorage.getItem("oshi_app_data");

    if(currentRaw === null){

        return {
            status: "current-data-missing",
            add: [],
            same: [],
            conflict: [],
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

    const result = compareObjectKeys(
        backupData.mainData,
        currentData
    );

    return {
        status: "read-only-comparison",
        ...result
    };

}


/* =====================================================
   5. メディア比較
===================================================== */

async function compareMedia(backupMedia){

    const result = {
        add: [],
        sameId: [],
        conflict: [],
        invalid: []
    };

    if(!Array.isArray(backupMedia)){
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

        const current = currentMap.get(id);

        result.sameId.push({

            id: id,
            backup: item,
            current: current

        });

    }

    return result;

}


/* =====================================================
   6. 取り込み予定の作成
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

    const preview = {

        createdAt: new Date().toISOString(),

        mode: "READ_ONLY",

        mainData:
            compareMainData(backupData),

        localStorage:
            compareLocalStorage(
                backupData.localStorage
            ),

        media:
            await compareMedia(
                backupData.media
            )

    };

    preview.summary = {

        mainDataAdd:
            preview.mainData.add.length,

        mainDataSame:
            preview.mainData.same.length,

        mainDataConflict:
            preview.mainData.conflict.length,

        localStorageAdd:
            preview.localStorage.add.length,

        localStorageSame:
            preview.localStorage.same.length,

        localStorageConflict:
            preview.localStorage.conflict.length,

        mediaAdd:
            preview.media.add.length,

        mediaSameId:
            preview.media.sameId.length,

        mediaConflict:
            preview.media.conflict.length,

        mediaInvalid:
            preview.media.invalid.length

    };

    return preview;

}


/* =====================================================
   7. 公開
===================================================== */

window.BackupImport = {

    createImportPreview:
        createImportPreview

};

})();
