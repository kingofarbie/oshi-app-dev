
/* =====================================================
   💾 バックアップ管理
   backup-manager.js

   第2段階：
   ・バックアップ対象の台帳
   ・保存先の確認
   ・既存データの読み取り
   ・選択データの収集
   ・収集結果の確認

   ※既存の保存処理は変更しない
   ※この段階ではファイル出力・復元・削除を行わない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. バックアップ対象台帳
===================================================== */

const BACKUP_SOURCES = [

    {
        id:"main",
        name:"アプリの基本データ",
        category:"基本データ",
        storage:"localStorage",
        key:"oshi_app_data"
    },

    {
        id:"children",
        name:"子ども関連データ",
        category:"子ども関連",
        storage:"localStorage",
        key:"oshi_app_children"
    },

    {
        id:"childrenSelected",
        name:"選択中の子ども",
        category:"子ども関連",
        storage:"localStorage",
        key:"oshi_app_children_selected"
    },

    {
        id:"theme",
        name:"テーマ設定",
        category:"設定",
        storage:"localStorage",
        key:"theme"
    },

    {
        id:"lastPage",
        name:"最後に開いたページ",
        category:"設定",
        storage:"localStorage",
        key:"oshi_last_page"
    },

    {
        id:"lastPlannerDate",
        name:"最後に開いた手帳の日付",
        category:"設定",
        storage:"localStorage",
        key:"oshi_last_planner_date"
    },

    {
        id:"anniversaryColor",
        name:"記念日カラー履歴",
        category:"記念日",
        storage:"localStorage",
        key:"anniversary_color_history"
    },

    {
        id:"notificationHistory",
        name:"通知履歴",
        category:"通知",
        storage:"localStorage",
        key:"oshi_notification_history"
    },

    {
        id:"notifiedEvents",
        name:"通知済み予定の記録",
        category:"通知",
        storage:"localStorage",
        key:"notifiedEvents"
    },

    {
        id:"favoritePhotoSort",
        name:"お気に入り写真の並び順",
        category:"並び替え設定",
        storage:"localStorage",
        key:"favoritePhotoSort"
    },

    {
        id:"calendarPhotoSort",
        name:"カレンダー写真の並び順",
        category:"並び替え設定",
        storage:"localStorage",
        key:"calendarPhotoSort"
    },

    {
        id:"favoriteMovieSort",
        name:"お気に入り動画の並び順",
        category:"並び替え設定",
        storage:"localStorage",
        key:"favoriteMovieSort"
    },

    {
        id:"calendarMovieSort",
        name:"カレンダー動画の並び順",
        category:"並び替え設定",
        storage:"localStorage",
        key:"calendarMovieSort"
    },

    {
        id:"media",
        name:"写真・動画の実ファイル",
        category:"写真・動画",
        storage:"IndexedDB",
        database:"oshi_app_media",
        store:"media"
    }

];


/* =====================================================
   2. メインDB内の確認済み項目
===================================================== */

const MAIN_DATA_ITEMS = [

    {
        id:"settings",
        name:"アプリ設定",
        category:"設定",
        path:"settings"
    },

    {
        id:"oshiList",
        name:"推し一覧",
        category:"推し情報",
        path:"oshiList"
    },

    {
        id:"oshiDetails",
        name:"推し詳細情報",
        category:"推し情報",
        path:"oshiDetails"
    },

    {
        id:"oshiRecords",
        name:"推しの記録",
        category:"推し情報",
        path:"oshiRecords"
    },

    {
        id:"events",
        name:"予定・カレンダー",
        category:"予定",
        path:"events"
    },

    {
        id:"categories",
        name:"予定カテゴリー",
        category:"予定",
        path:"categories"
    },

    {
        id:"dayMemories",
        name:"1日手帳の日々の記録",
        category:"1日手帳",
        path:"dayMemories"
    },

    {
        id:"plannerNotes",
        name:"1日手帳のメモ",
        category:"1日手帳",
        path:"plannerNotes"
    },

    {
        id:"plannerStickerPlacements",
        name:"1日手帳のステッカー配置",
        category:"1日手帳",
        path:"plannerStickerPlacements"
    },

    {
        id:"memorialDays",
        name:"記念日・メモリアルデー",
        category:"記念日",
        path:"memorialDays"
    },

    {
        id:"anniversaryDays",
        name:"記念日",
        category:"記念日",
        path:"anniversaryDays"
    },

    {
        id:"favoriteEvents",
        name:"お気に入り予定",
        category:"お気に入り",
        path:"favoriteEvents"
    },

    {
        id:"favoritePhotos",
        name:"お気に入り写真",
        category:"お気に入り",
        path:"favoritePhotos"
    },

    {
        id:"favorites",
        name:"お気に入り情報",
        category:"お気に入り",
        path:"favorites"
    },

    {
        id:"sportsCalendar",
        name:"スポーツカレンダー",
        category:"スポーツ",
        path:"sportsCalendar"
    },

    {
        id:"healthCalendar",
        name:"健康カレンダー",
        category:"健康",
        path:"healthCalendar"
    },

    {
        id:"familySchedule",
        name:"家族予定",
        category:"家族",
        path:"familySchedule"
    },

    {
        id:"money",
        name:"家計・推し活費",
        category:"お金",
        path:"money"
    }

];


/* =====================================================
   3. localStorage の読み取り
===================================================== */

function readLocalStorage(key){

    const value = localStorage.getItem(key);

    if(value === null){

        return {
            exists:false,
            value:null
        };

    }

    try{

        return {
            exists:true,
            value:JSON.parse(value)
        };

    }catch(error){

        return {
            exists:true,
            value:value
        };

    }

}


/* =====================================================
   4. メインDBの読み取り
===================================================== */

function readMainData(){

    return readLocalStorage("oshi_app_data");

}


/* =====================================================
   5. メディアデータの読み取り
===================================================== */

async function readMediaData(){

    if(typeof getAllMediaFiles !== "function"){

        throw new Error(
            "getAllMediaFiles() が見つかりません。"
        );

    }

    const media = await getAllMediaFiles();

    if(!Array.isArray(media)){

        throw new Error(
            "写真・動画の一覧を取得できませんでした。"
        );

    }

    return media;

}


/* =====================================================
   6. 保存先の確認
===================================================== */

async function inspectSources(){

    const results = [];

    for(const source of BACKUP_SOURCES){

        if(source.storage === "localStorage"){

            const data = readLocalStorage(source.key);

            results.push({

                id:source.id,
                name:source.name,
                category:source.category,
                storage:source.storage,
                exists:data.exists

            });

        }

        else if(source.storage === "IndexedDB"){

            try{

                const media = await readMediaData();

                results.push({

                    id:source.id,
                    name:source.name,
                    category:source.category,
                    storage:source.storage,
                    exists:true,
                    count:media.length

                });

            }catch(error){

                results.push({

                    id:source.id,
                    name:source.name,
                    category:source.category,
                    storage:source.storage,
                    exists:false,
                    error:error.message

                });

            }

        }

    }

    return results;

}


/* =====================================================
   7. 選択データの収集
===================================================== */

async function collectSelectedData(selectedIds){

    if(!Array.isArray(selectedIds)){

        throw new Error(
            "バックアップ項目を配列で指定してください。"
        );

    }

    const selected = new Set(selectedIds);

    const knownIds = new Set([

        ...BACKUP_SOURCES.map(item=>item.id),

        ...MAIN_DATA_ITEMS.map(item=>item.id)

    ]);


    /* -----------------------------
       未登録項目の確認
    ----------------------------- */

    for(const id of selected){

        if(!knownIds.has(id)){

            throw new Error(
                "未登録のバックアップ項目です: " + id
            );

        }

    }


    /* -----------------------------
       収集結果の入れ物
    ----------------------------- */

    const result = {

        format:"oshi-app-backup-data",

        version:1,

        createdAt:new Date().toISOString(),

        mainData:{},

        localStorage:{},

        media:[],

        summary:{}

    };


    /* =================================================
       7-1. メインDBの収集
    ================================================= */

    const mainSelected = selected.has("main");

    const selectedMainItems = MAIN_DATA_ITEMS.filter(item=>

        mainSelected || selected.has(item.id)

    );

    if(selectedMainItems.length > 0){

        const main = readMainData();

        if(
            !main.exists ||
            !main.value ||
            typeof main.value !== "object"
        ){

            throw new Error(
                "メインDBを読み取れませんでした。"
            );

        }

        for(const item of selectedMainItems){

            if(
                Object.prototype.hasOwnProperty.call(
                    main.value,
                    item.path
                )
            ){

                result.mainData[item.path] =
                    main.value[item.path];

            }

        }

    }


    /* =================================================
       7-2. 独立したlocalStorageの収集
    ================================================= */

    for(const source of BACKUP_SOURCES){

        if(source.storage !== "localStorage"){
            continue;
        }

        if(source.id === "main"){
            continue;
        }

        if(!selected.has(source.id)){
            continue;
        }

        const data = readLocalStorage(source.key);

        result.localStorage[source.key] = {

            id:source.id,

            name:source.name,

            exists:data.exists,

            value:data.value

        };

    }


    /* =================================================
       7-3. 写真・動画の収集
    ================================================= */

    if(selected.has("media")){

        const media = await readMediaData();

        result.media = media;

    }


    /* =================================================
       7-4. 収集件数
    ================================================= */

    result.summary = {

        mainDataCount:
            Object.keys(result.mainData).length,

        localStorageCount:
            Object.keys(result.localStorage).length,

        mediaCount:
            result.media.length

    };


    return result;

}


/* =====================================================
   8. 収集結果の確認
===================================================== */

function inspectCollectedData(data){

    if(
        !data ||
        data.format !== "oshi-app-backup-data"
    ){

        throw new Error(
            "バックアップデータの形式が正しくありません。"
        );

    }

    const media = Array.isArray(data.media)
        ? data.media
        : [];

    const mediaSize = media.reduce(

        (total,item)=>{

            return total + (
                item.file?.size || 0
            );

        },

        0

    );

    const mediaTypes = {};

    for(const item of media){

        const type = item.type || "unknown";

        mediaTypes[type] =
            (mediaTypes[type] || 0) + 1;

    }

    return {

        createdAt:data.createdAt,

        mainDataItems:
            Object.keys(data.mainData || {}),

        localStorageItems:
            Object.keys(data.localStorage || {}),

        mediaCount:media.length,

        mediaTypes:mediaTypes,

        mediaSize:mediaSize,

        summary:data.summary || {}

    };

}


/* =====================================================
   9. 外部から利用する機能
===================================================== */

window.BackupManager = {

    /* 台帳 */

    getSources:function(){

        return BACKUP_SOURCES.map(source=>({...source}));

    },

    getMainDataItems:function(){

        return MAIN_DATA_ITEMS.map(item=>({...item}));

    },


    /* 読み取り */

    readLocalStorage:readLocalStorage,

    readMainData:readMainData,

    readMediaData:readMediaData,


    /* 保存先確認 */

    inspectSources:inspectSources,


    /* 選択データ収集 */

    collectSelectedData:collectSelectedData,

    inspectCollectedData:inspectCollectedData

};


})();
