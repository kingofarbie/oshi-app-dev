
/* =====================================================
   💾 安全な取り込み計画作成
   backup-import-plan.js

   ・PC側の既存データを保持
   ・バックアップ側にしかない項目だけ追加候補にする
   ・同じIDのデータは上書きしない
   ・競合項目は変更しない
   ・実際の保存処理は行わない
===================================================== */

(function(){

"use strict";

function isObject(value){
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value);
}

function cloneJSON(value){
    return JSON.parse(JSON.stringify(value));
}

function hasOwn(object, key){
    return Object.prototype.hasOwnProperty.call(object, key);
}


/* ID付き配列へ未登録データだけを追加 */
function addArrayItems(target, comparison, label, errors){

    if(!Array.isArray(target)){
        errors.push(label + "：PC側の形式が配列ではありません");
        return;
    }

    const ids = new Set();

    for(const item of target){
        if(!item || item.id == null) continue;

        const id = String(item.id);

        if(ids.has(id)){
            errors.push(label + "：PC側に重複IDがあります：" + id);
            return;
        }

        ids.add(id);
    }

    for(const item of comparison.add){

        if(!item || item.id == null){
            errors.push(label + "：追加候補にIDがありません");
            continue;
        }

        const id = String(item.id);

        if(ids.has(id)){
            errors.push(label + "：追加候補のIDが既存データと重複：" + id);
            continue;
        }

        ids.add(id);
        target.push(cloneJSON(item));
    }
}


/* オブジェクトの未登録キーだけを追加 */
function addObjectItems(target, comparison, label, errors){

    if(!isObject(target)){
        errors.push(label + "：PC側の形式がオブジェクトではありません");
        return;
    }

    for(const item of comparison.add){

        if(!item || typeof item.key !== "string"){
            errors.push(label + "：追加候補のキーが不正です");
            continue;
        }

        if(hasOwn(target, item.key)){
            errors.push(label + "：追加候補のキーが既存データと重複：" + item.key);
            continue;
        }

        target[item.key] = cloneJSON(item.value);
    }
}


/* メインDBの追加候補を組み立てる */
function buildMainDataCandidate(currentData, comparison){

    const candidate = cloneJSON(currentData);
    const errors = [];

    /* 推し一覧 */
    if(comparison.oshiList){
        if(!Array.isArray(candidate.oshiList)){
            errors.push("oshiList：PC側の形式が配列ではありません");
        }else{
            addArrayItems(
                candidate.oshiList,
                comparison.oshiList,
                "oshiList",
                errors
            );
        }
    }

    /* 推し詳細 */
    if(comparison.oshiDetails){

        if(!isObject(candidate.oshiDetails)){
            errors.push("oshiDetails：PC側の形式が不正です");
        }else{
            addObjectItems(
                candidate.oshiDetails,
                comparison.oshiDetails,
                "oshiDetails",
                errors
            );
        }
    }

    /* 推し記録 */
    if(comparison.oshiRecords){

        if(!isObject(candidate.oshiRecords)){
            errors.push(
                "oshiRecords：PC側がオブジェクト形式ではないため保留"
            );
        }else{

            const recordIds = new Set();

            Object.values(candidate.oshiRecords).forEach(records => {
                if(!Array.isArray(records)) return;

                records.forEach(record => {
                    if(record && record.id != null){
                        recordIds.add(String(record.id));
                    }
                });
            });

            comparison.oshiRecords.add.forEach(record => {

                if(!record || record.id == null || !record.oshiId){
                    errors.push("oshiRecords：追加候補の情報が不足しています");
                    return;
                }

                const id = String(record.id);

                if(recordIds.has(id)){
                    errors.push("oshiRecords：ID重複のため保留：" + id);
                    return;
                }

                const oshiId = String(record.oshiId);

                if(
                    hasOwn(candidate.oshiRecords, oshiId) &&
                    !Array.isArray(candidate.oshiRecords[oshiId])
                ){
                    errors.push(
                        "oshiRecords：" + oshiId + " の保存形式が不正です"
                    );
                    return;
                }

                if(!hasOwn(candidate.oshiRecords, oshiId)){
                    candidate.oshiRecords[oshiId] = [];
                }

                candidate.oshiRecords[oshiId].push(cloneJSON(record));
                recordIds.add(id);
            });
        }
    }

    /* ID付き配列 */
    [
        "events",
        "categories",
        "plannerNotes",
        "plannerStickerPlacements",
        "anniversaryDays"
    ].forEach(key => {

        const item = comparison.items[key];
        if(!item) return;

        if(!Array.isArray(candidate[key])){
            errors.push(key + "：PC側の形式が配列ではありません");
            return;
        }

        addArrayItems(candidate[key], item, key, errors);
    });

    /* 日付キーの思い出 */
    if(comparison.items.dayMemories){

        if(!isObject(candidate.dayMemories)){
            errors.push("dayMemories：PC側の形式が不正です");
        }else{
            addObjectItems(
                candidate.dayMemories,
                comparison.items.dayMemories,
                "dayMemories",
                errors
            );
        }
    }

    /* 設定：存在しない項目だけ追加 */
    if(comparison.items.settings){

        if(!isObject(candidate.settings)){
            errors.push("settings：PC側の形式が不正です");
        }else{

            const settingResult = comparison.items.settings;

            addObjectItems(
                candidate.settings,
                settingResult,
                "settings",
                errors
            );

            /*
             * notificationsだけは中の項目単位で追加。
             * PC側に存在する値は変更しない。
             */
            const backupNotifications =
                settingResult.conflict.find(
                    x => x.key === "notifications"
                );

            if(backupNotifications){

                const backupValue = backupNotifications.backup;
                const currentValue = candidate.settings.notifications;

                if(
                    isObject(backupValue) &&
                    isObject(currentValue)
                ){

                    Object.entries(backupValue).forEach(([key, value]) => {

                        if(!hasOwn(currentValue, key)){
                            currentValue[key] = cloneJSON(value);
                        }

                    });

                }
            }
        }
    }

    /* お気に入り：キー自体がないものだけ追加 */
    if(comparison.items.favorites){

        if(!isObject(candidate.favorites)){
            errors.push("favorites：PC側の形式が不正です");
        }else{
            addObjectItems(
                candidate.favorites,
                comparison.items.favorites,
                "favorites",
                errors
            );
        }
    }

    /*
     * 以下は意図的に変更しない。
     * sportsCalendar
     * healthCalendar
     * familySchedule
     * money
     * 競合中のsettings項目
     * 競合中のfavorites項目
     */

    return {
        candidate,
        errors
    };
}


/* 取り込み計画を作成 */
async function createImportPlan(backupData){

    if(
        !window.BackupImport ||
        typeof window.BackupImport.createImportPreview !== "function"
    ){
        throw new Error("バックアップ比較機能が見つかりません");
    }

    const preview =
        await window.BackupImport.createImportPreview(backupData);

    const currentRaw =
        localStorage.getItem("oshi_app_data");

    if(currentRaw === null){
        throw new Error("PC側のメインデータがありません");
    }

    let currentData;

    try{
        currentData = JSON.parse(currentRaw);
    }catch(error){
        throw new Error("PC側のメインデータを解析できません");
    }

    if(!isObject(currentData)){
        throw new Error("PC側のメインデータ形式が不正です");
    }

    const built = buildMainDataCandidate(
        currentData,
        preview.mainData
    );

    /*
     * この計画は読み取り専用。
     * localStorage・IndexedDBへの保存は行わない。
     */
    return {
        createdAt: new Date().toISOString(),
        mode: "READ_ONLY_PLAN",

        mainDataCandidate: built.candidate,

        localStorageAdd:
            cloneJSON(preview.localStorage.add),

        mediaAdd:
            preview.media.add.slice(),

        held: {
            mainData: preview.mainData.held,
            localStorage: preview.localStorage.conflict,
            mediaSameId: preview.media.sameId,
            mediaConflict: preview.media.conflict
        },

        errors: built.errors,

        summary: {
            mainDataAddCandidates:
                preview.summary.oshiListAdd +
                preview.summary.oshiDetailsAdd +
                preview.summary.oshiRecordsAdd +
                preview.summary.eventsAdd +
                preview.summary.plannerNotesAdd +
                preview.summary.plannerStickerPlacementsAdd +
                preview.summary.anniversaryDaysAdd +
                preview.summary.dayMemoriesAdd,

            mediaAddCandidates:
                preview.media.add.length,

            localStorageAddCandidates:
                preview.localStorage.add.length,

            errors:
                built.errors.length
        }
    };
}


/* 公開 */
window.BackupImportPlan = {
    createImportPlan
};

})();
