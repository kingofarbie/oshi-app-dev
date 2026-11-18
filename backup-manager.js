
/* =====================================================
   💾 バックアップ管理
   backup-manager.js

   第1段階：
   ・バックアップ対象の台帳
   ・保存先の確認
   ・既存データの読み取り

   ※既存の保存処理は変更しない
   ※この段階では書き込み・削除・復元を行わない
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

   実際の保存先は oshi_app_data。
   ここでは分類用の情報だけを管理する。
===================================================== */

const MAIN_DATA_ITEMS = [

    {
        id:"events",
        name:"予定・カレンダー",
        path:"events"
    },

    {
        id:"dayMemories",
        name:"1日手帳・日々の記録",
        path:"dayMemories"
    },

    {
        id:"oshiList",
        name:"推し情報",
        path:"oshiList"
    },

    {
        id:"money",
        name:"お金・推し活費",
        path:"money"
    },

    {
        id:"settings",
        name:"アプリ設定",
        path:"settings"
    },

    {
        id:"categories",
        name:"カテゴリー設定",
        path:"categories"
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

    return await getAllMediaFiles();

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
   7. 外部から利用する機能
===================================================== */

window.BackupManager = {

    getSources:function(){

        return BACKUP_SOURCES.map(source=>({...source}));

    },

    getMainDataItems:function(){

        return MAIN_DATA_ITEMS.map(item=>({...item}));

    },

    readLocalStorage:readLocalStorage,

    readMainData:readMainData,

    readMediaData:readMediaData,

    inspectSources:inspectSources

};


})();
