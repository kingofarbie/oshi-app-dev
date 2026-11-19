
/* =====================================================
   💾 復元前の安全確認
   backup-safety.js

   第1段階：読み取り専用

   ・同一オリジンのlocalStorage全キーを取得
   ・メインデータ全体を取得
   ・IndexedDBのメディア全件と実ファイルを取得
   ・件数、容量、形式を集計

   ※保存・上書き・削除・復元は行わない
   ※既存の保存処理は変更しない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. localStorage全件を読み取る
===================================================== */

function readAllLocalStorage(){

    const result = [];

    for(let i = 0; i < localStorage.length; i++){

        const key = localStorage.key(i);

        if(key === null) continue;

        const rawValue = localStorage.getItem(key);

        let value = rawValue;
        let jsonParsed = false;

        try{

            value = JSON.parse(rawValue);
            jsonParsed = true;

        }catch(error){

            // JSON以外は文字列のまま保持

        }

        result.push({

            key:key,
            rawValue:rawValue,
            value:value,
            jsonParsed:jsonParsed,
            size:new Blob([rawValue || ""]).size

        });

    }

    return result;

}


/* =====================================================
   2. メインデータを確認
===================================================== */

function inspectMainData(){

    const raw = localStorage.getItem("oshi_app_data");

    if(raw === null){

        return {
            exists:false,
            valid:false,
            data:null,
            keys:[],
            error:"メインデータが見つかりません。"
        };

    }

    let data;

    try{

        data = JSON.parse(raw);

    }catch(error){

        return {
            exists:true,
            valid:false,
            data:null,
            keys:[],
            error:"メインデータをJSONとして読み取れません。"
        };

    }

    if(
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ){

        return {
            exists:true,
            valid:false,
            data:null,
            keys:[],
            error:"メインデータの形式が正しくありません。"
        };

    }

    return {

        exists:true,
        valid:true,
        data:data,
        keys:Object.keys(data),
        error:null

    };

}


/* =====================================================
   3. IndexedDBのメディアを読み取る
===================================================== */

async function readAllMedia(){

    if(typeof window.getAllMediaFiles !== "function"){

        throw new Error(
            "getAllMediaFiles() が見つかりません。"
        );

    }

    const records = await window.getAllMediaFiles();

    if(!Array.isArray(records)){

        throw new Error(
            "メディア一覧を取得できませんでした。"
        );

    }

    let totalSize = 0;

    const types = {};

    const details = records.map(record => {

        if(!record || record.id === undefined){

            throw new Error(
                "IDが確認できないメディアがあります。"
            );

        }

        if(!(record.file instanceof Blob)){

            throw new Error(
                "実ファイルが確認できないメディアがあります: " +
                record.id
            );

        }

        totalSize += record.file.size;

        const type = record.file.type || "unknown";

        types[type] = (types[type] || 0) + 1;

        return {

            id:record.id,
            type:record.type || "unknown",
            mimeType:type,
            size:record.file.size,
            savedAt:record.savedAt

        };

    });

    return {

        count:records.length,
        totalSize:totalSize,
        types:types,

        // 実ファイルBlobを含む全レコード
        records:records,

        // 確認・表示用情報
        details:details

    };

}


/* =====================================================
   4. 全データを読み取り・検査
===================================================== */

async function inspectCurrentData(){

    const localItems = readAllLocalStorage();

    const mainData = inspectMainData();

    const media = await readAllMedia();

    const localStorageSize = localItems.reduce(
        (sum,item) => sum + item.size,
        0
    );

    const report = {

        checkedAt:new Date().toISOString(),

        localStorage:{
            count:localItems.length,
            totalSize:localStorageSize,
            keys:localItems.map(item => item.key)
        },

        mainData:{
            exists:mainData.exists,
            valid:mainData.valid,
            count:mainData.keys.length,
            keys:mainData.keys,
            error:mainData.error
        },

        media:{
            count:media.count,
            totalSize:media.totalSize,
            types:media.types
        },

        valid:
            mainData.valid &&
            media.records.length === media.count

    };

    return {

        report:report,

        snapshot:{

            localStorage:localItems,

            mainData:mainData.data,

            // Blobを含むメディア全件
            media:media.records,

            // メディア確認用情報
            mediaDetails:media.details

        }

    };

}


/* =====================================================
   5. 公開
===================================================== */

window.BackupSafety = {

    inspectCurrentData:inspectCurrentData

};


})();
