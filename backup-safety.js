
/* =========================================================
   推し活手帳
   復元前・保護用バックアップ
   既存データの読み取り専用
========================================================= */

(function(){
"use strict";


/* =========================================================
   localStorage 全件取得
   値は加工せず rawValue のまま保持
========================================================= */

function readAllLocalStorage(){

    const result = [];

    for(let i = 0; i < localStorage.length; i++){

        const key = localStorage.key(i);

        if(key === null) continue;

        const rawValue = localStorage.getItem(key);

        result.push({

            key:key,

            rawValue:rawValue,

            size:new Blob([rawValue || ""]).size

        });

    }

    return result;

}


/* =========================================================
   メインデータ確認
========================================================= */

function inspectMainData(){

    const raw =
        localStorage.getItem("oshi_app_data");

    if(raw === null){

        throw new Error(
            "メインデータが見つかりません。"
        );

    }

    let data;

    try{

        data = JSON.parse(raw);

    }catch(error){

        throw new Error(
            "メインデータをJSONとして読み取れません。"
        );

    }

    if(
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ){

        throw new Error(
            "メインデータの形式が正しくありません。"
        );

    }

    return data;

}


/* =========================================================
   IndexedDB メディア全件取得
========================================================= */

async function readAllMedia(){

    if(typeof window.getAllMediaFiles !== "function"){

        throw new Error(
            "getAllMediaFiles() が見つかりません。"
        );

    }

    const records =
        await window.getAllMediaFiles();

    if(!Array.isArray(records)){

        throw new Error(
            "メディア一覧を取得できませんでした。"
        );

    }

    const ids = new Set();

    let totalSize = 0;

    const types = {};

    for(const record of records){

        if(
            !record ||
            record.id === undefined ||
            record.id === null
        ){

            throw new Error(
                "IDが確認できないメディアがあります。"
            );

        }

        const id = String(record.id);

        if(ids.has(id)){

            throw new Error(
                "メディアIDが重複しています: " + id
            );

        }

        ids.add(id);

        if(!(record.file instanceof Blob)){

            throw new Error(
                "実ファイルが確認できないメディアがあります: " + id
            );

        }

        totalSize += record.file.size;

        const mimeType =
            record.file.type || "unknown";

        types[mimeType] =
            (types[mimeType] || 0) + 1;

    }

    return {

        records:records,

        count:records.length,

        totalSize:totalSize,

        types:types

    };

}


/* =========================================================
   現在のデータを読み取り専用で検査
========================================================= */

async function inspectCurrentData(){

    const localItems =
        readAllLocalStorage();

    const mainData =
        inspectMainData();

    const media =
        await readAllMedia();

    const report = {

        checkedAt:new Date().toISOString(),

        localStorage:{

            count:localItems.length,

            totalSize:localItems.reduce(
                (sum,item) => sum + item.size,
                0
            ),

            keys:localItems.map(
                item => item.key
            )

        },

        mainData:{

            exists:true,

            valid:true,

            count:Object.keys(mainData).length,

            keys:Object.keys(mainData)

        },

        media:{

            count:media.count,

            totalSize:media.totalSize,

            types:media.types

        },

        valid:true

    };

    return {

        report:report,

        snapshot:{

            localStorage:localItems,

            mainData:mainData,

            media:media.records

        }

    };

}


/* =========================================================
   保護用バックアップデータを作成
========================================================= */

function createSafetyBackupData(snapshot){

    const localStorageData = {};

    for(const item of snapshot.localStorage){

        localStorageData[item.key] = {

            id:item.key,

            name:item.key,

            exists:true,

            value:item.rawValue

        };

    }

    return {

        format:"oshi-app-backup-data",

        createdAt:new Date().toISOString(),

        mainData:snapshot.mainData,

        localStorage:localStorageData,

        media:snapshot.media,

        summary:{

            kind:"pre-restore-safety",

            description:"復元前の全データ保護用バックアップ",

            localStorageCount:
                snapshot.localStorage.length,

            mainDataCount:
                Object.keys(snapshot.mainData).length,

            mediaCount:
                snapshot.media.length,

            mediaSize:
                snapshot.media.reduce(
                    (sum,item) => sum + item.file.size,
                    0
                )

        }

    };

}


/* =========================================================
   保護用ZIP作成・再検査
   ファイル保存はまだ行わない
========================================================= */

async function createSafetyBackupFile(){

    if(
        !window.BackupManager ||
        typeof window.BackupManager.createZipBlob !== "function"
    ){

        throw new Error(
            "ZIP作成機能が見つかりません。"
        );

    }

    if(
        typeof window.BackupManager.inspectBackupFile !== "function"
    ){

        throw new Error(
            "ZIP検査機能が見つかりません。"
        );

    }


    /* 最新状態を改めて取得 */

    const inspected =
        await inspectCurrentData();

    const snapshot =
        inspected.snapshot;


    /* ZIP作成用データ */

    const backupData =
        createSafetyBackupData(snapshot);


    /* ZIPを作成 */

    const zipBlob =
        await window.BackupManager.createZipBlob(
            backupData
        );


    if(
        !(zipBlob instanceof Blob) ||
        zipBlob.size <= 0
    ){

        throw new Error(
            "保護用ZIPを作成できませんでした。"
        );

    }


    /* ファイル名 */

    const now =
        new Date();

    const date =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2,"0") +
        String(now.getDate()).padStart(2,"0") +
        "_" +
        String(now.getHours()).padStart(2,"0") +
        String(now.getMinutes()).padStart(2,"0") +
        String(now.getSeconds()).padStart(2,"0");

    const fileName =
        "推し活手帳_復元前保護バックアップ_" +
        date +
        ".zip";


    /* ZIPをFile化 */

    const file = new File(
        [zipBlob],
        fileName,
        {
            type:"application/zip"
        }
    );


    /* 作成したZIPを読み直して検査 */

    const checked =
        await window.BackupManager.inspectBackupFile(
            file
        );

    if(
        !checked ||
        !checked.report ||
        checked.report.valid !== true
    ){

        throw new Error(
            "保護用ZIPの検査に失敗しました。"
        );

    }


    /* 件数・容量の照合 */

    const report =
        checked.report;

    if(
        report.mainDataItems !==
        Object.keys(snapshot.mainData).length
    ){

        throw new Error(
            "メインデータの件数が一致しません。"
        );

    }

    if(
        report.localStorageItems !==
        snapshot.localStorage.length
    ){

        throw new Error(
            "localStorageの件数が一致しません。"
        );

    }

    if(
        report.mediaCount !==
        snapshot.media.length
    ){

        throw new Error(
            "メディアの件数が一致しません。"
        );

    }

    const expectedMediaSize =
        snapshot.media.reduce(
            (sum,item) => sum + item.file.size,
            0
        );

    if(
        report.mediaSize !== expectedMediaSize
    ){

        throw new Error(
            "メディアの合計サイズが一致しません。"
        );

    }


    /* 検査済みファイルを返す */

    return {

        file:file,

        report:report,

        snapshotReport:inspected.report

    };

}


/* =========================================================
   公開
========================================================= */

window.BackupSafety = {

    inspectCurrentData,

    createSafetyBackupFile

};

})();
