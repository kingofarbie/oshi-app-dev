
/* =========================================================
   推し活手帳
   バックアップ復元 UI

   ・ZIP選択、検査
   ・PCデータとの読み取り専用比較
   ・推し一覧の詳細比較
   ・推し詳細情報の比較
   ・推し記録の比較
   ・メディア比較
   ・復元前保護バックアップ作成、保存、再検査

   ※スマホデータの復元・統合・削除は行わない
========================================================= */

(function(){

    let selectedBackupFile = null;
    let inspectedBackupData = null;


    /* =====================================================
       メッセージ
    ===================================================== */

    function showMessage(message, isError = false){

        const element =
            document.getElementById("restoreBackupMessage");

        if(!element) return;

        element.textContent = message;
        element.style.color = isError ? "#d33" : "";

    }


    /* =====================================================
       比較用データ処理
    ===================================================== */

    function normalizeValue(value){

        if(Array.isArray(value)){
            return value.map(normalizeValue);
        }

        if(value && typeof value === "object"){

            const result = {};

            Object.keys(value)
                .sort()
                .forEach(key => {
                    result[key] = normalizeValue(value[key]);
                });

            return result;

        }

        return value;

    }


    function sameValue(a, b){

        return (
            JSON.stringify(normalizeValue(a)) ===
            JSON.stringify(normalizeValue(b))
        );

    }


    function parseStoredValue(value){

        if(typeof value !== "string"){
            return value;
        }

        try{
            return JSON.parse(value);
        }catch(error){
            return value;
        }

    }


    function safeString(value){

        if(value === undefined || value === null){
            return "";
        }

        return String(value);

    }


    /* =====================================================
       メインデータ比較
    ===================================================== */

    function compareMainData(backupData, currentData){

        const backup = backupData || {};
        const current = currentData || {};

        const backupKeys = Object.keys(backup);
        const currentKeys = Object.keys(current);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backupKeys.forEach(key => {

            if(!Object.prototype.hasOwnProperty.call(current, key)){

                backupOnly.push(key);

            }else if(sameValue(backup[key], current[key])){

                identical.push(key);

            }else{

                different.push(key);

            }

        });

        currentKeys.forEach(key => {

            if(!Object.prototype.hasOwnProperty.call(backup, key)){
                currentOnly.push(key);
            }

        });

        return {
            backupCount: backupKeys.length,
            currentCount: currentKeys.length,
            backupOnly,
            currentOnly,
            identical,
            different
        };

    }


    /* =====================================================
       推し一覧の形式を統一
    ===================================================== */

    function convertOshiList(data){

        if(Array.isArray(data)){

            return data.map(item => ({
                item,
                objectKey: ""
            }));

        }

        if(data && typeof data === "object"){

            if(Array.isArray(data.list)){
                return data.list.map(item => ({
                    item,
                    objectKey: ""
                }));
            }

            if(Array.isArray(data.items)){
                return data.items.map(item => ({
                    item,
                    objectKey: ""
                }));
            }

            return Object.entries(data).map(([key, item]) => ({
                item,
                objectKey: key
            }));

        }

        return [];

    }


    function getOshiInfo(entry){

        const item = entry.item;

        if(!item || typeof item !== "object"){
            return {
                id: "",
                name: ""
            };
        }

        return {

            id: safeString(
                item.id ??
                item.oshiId ??
                item.uid ??
                entry.objectKey
            ),

            name: safeString(
                item.name ??
                item.oshiName ??
                item.title ??
                item.groupName
            )

        };

    }


    /* =====================================================
       推し一覧比較
    ===================================================== */

    function compareOshiListDetail(
        backupMainData,
        currentMainData
    ){

        const backup =
            convertOshiList(
                backupMainData?.oshiList
            ).map(getOshiInfo);

        const current =
            convertOshiList(
                currentMainData?.oshiList
            ).map(getOshiInfo);

        const backupIds = new Set(
            backup.filter(item => item.id).map(item => item.id)
        );

        const currentIds = new Set(
            current.filter(item => item.id).map(item => item.id)
        );

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const nameDifferent = [];

        backup.forEach(item => {

            if(!item.id) return;

            if(!currentIds.has(item.id)){

                backupOnly.push(item);

            }else{

                const matched =
                    current.find(other => other.id === item.id);

                if(matched){

                    if(item.name === matched.name){

                        identical.push(item);

                    }else{

                        nameDifferent.push({
                            id: item.id,
                            backupName: item.name,
                            currentName: matched.name
                        });

                    }

                }

            }

        });

        current.forEach(item => {

            if(item.id && !backupIds.has(item.id)){
                currentOnly.push(item);
            }

        });

        function findDuplicateIds(items){

            const counts = new Map();

            items.forEach(item => {

                if(!item.id) return;

                counts.set(
                    item.id,
                    (counts.get(item.id) || 0) + 1
                );

            });

            return Array.from(counts.entries())
                .filter(([id, count]) => count > 1)
                .map(([id, count]) => ({id, count}));

        }

        return {

            backupCount: backup.length,
            currentCount: current.length,

            backupItems: backup,
            currentItems: current,

            identical,
            backupOnly,
            currentOnly,
            nameDifferent,

            missingBackupId:
                backup.filter(item => !item.id),

            missingCurrentId:
                current.filter(item => !item.id),

            duplicateBackupIds:
                findDuplicateIds(backup),

            duplicateCurrentIds:
                findDuplicateIds(current)

        };

    }


    /* =====================================================
       詳細・記録データの共通処理

       対応する形式：
       ・配列
       ・IDをキーにしたオブジェクト
       ・オブジェクト内のlist / items配列

       IDの構造が不明なものは無理に統合しない
    ===================================================== */

    function convertDataCollection(data){

        if(Array.isArray(data)){

            return data.map((item, index) => ({
                item,
                objectKey: "",
                index
            }));

        }

        if(data && typeof data === "object"){

            if(Array.isArray(data.list)){

                return data.list.map((item, index) => ({
                    item,
                    objectKey: "",
                    index
                }));

            }

            if(Array.isArray(data.items)){

                return data.items.map((item, index) => ({
                    item,
                    objectKey: "",
                    index
                }));

            }

            return Object.entries(data).map(
                ([key, item], index) => ({
                    item,
                    objectKey: key,
                    index
                })
            );

        }

        return [];

    }


    /* =====================================================
       推しIDを取得

       データ形式が違う場合に備えて複数の候補を確認
    ===================================================== */

    function getRelatedOshiId(item, objectKey){

        if(!item || typeof item !== "object"){
            return "";
        }

        const direct =
            item.oshiId ??
            item.oshi_id ??
            item.oshiID ??
            item.parentOshiId ??
            item.favoriteOshiId ??
            item.targetOshiId;

        if(direct !== undefined && direct !== null){
            return String(direct);
        }

        if(
            item.oshi &&
            typeof item.oshi === "object"
        ){

            const nestedId =
                item.oshi.id ??
                item.oshi.oshiId;

            if(nestedId !== undefined && nestedId !== null){
                return String(nestedId);
            }

        }

        return "";

    }


    /* =====================================================
       データの識別情報を取得
    ===================================================== */

    function getCollectionInfo(entry, type){

        const item = entry.item;

        const ownerId =
            getRelatedOshiId(
                item,
                entry.objectKey
            );

        let recordId = "";

        if(item && typeof item === "object"){

            recordId = safeString(
                item.id ??
                item.recordId ??
                item.record_id ??
                item.detailId ??
                item.photoId ??
                item.eventId ??
                item.uid
            );

        }

        /*
           oshiDetailsは推しIDをキーにした
           オブジェクト形式の可能性があるため、
           オブジェクトキーも識別情報として保持する。
        */

        if(
            type === "oshiDetails" &&
            !recordId &&
            entry.objectKey
        ){

            recordId = entry.objectKey;

        }

        /*
           記録IDがない場合は内容から仮識別する。
           この場合は完全一致の確認にのみ使用し、
           別内容の記録を同一IDとは判定しない。
        */

        const contentKey =
            JSON.stringify(
                normalizeValue(item)
            );

        const matchKey =
            recordId
                ? "id:" + recordId
                : "content:" + contentKey;

        return {

            recordId,
            ownerId,
            matchKey,

            name: safeString(
                item?.name ??
                item?.title ??
                item?.label ??
                ""
            ),

            item

        };

    }


    /* =====================================================
       詳細・記録の比較
    ===================================================== */

    function compareDataCollection(
        backupData,
        currentData,
        type
    ){

        const backup =
            convertDataCollection(backupData)
                .map(entry =>
                    getCollectionInfo(entry, type)
                );

        const current =
            convertDataCollection(currentData)
                .map(entry =>
                    getCollectionInfo(entry, type)
                );

        const usedCurrent = new Set();

        const identical = [];
        const different = [];
        const backupOnly = [];

        backup.forEach((item, index) => {

            const matchedIndex =
                current.findIndex(
                    (other, currentIndex) =>
                        !usedCurrent.has(currentIndex) &&
                        other.matchKey === item.matchKey
                );

            if(matchedIndex === -1){

                backupOnly.push(item);

                return;

            }

            usedCurrent.add(matchedIndex);

            const currentItem =
                current[matchedIndex];

            if(sameValue(item.item, currentItem.item)){

                identical.push({
                    backup: item,
                    current: currentItem
                });

            }else{

                different.push({
                    backup: item,
                    current: currentItem
                });

            }

        });

        const currentOnly =
            current.filter(
                (item, index) =>
                    !usedCurrent.has(index)
            );

        const ownerIds = new Set(
            [...backup, ...current]
                .map(item => item.ownerId)
                .filter(Boolean)
        );

        const backupOwnerIds = new Set(
            backup.map(item => item.ownerId).filter(Boolean)
        );

        const currentOwnerIds = new Set(
            current.map(item => item.ownerId).filter(Boolean)
        );

        const noOwnerBackup =
            backup.filter(item => !item.ownerId);

        const noOwnerCurrent =
            current.filter(item => !item.ownerId);

        return {

            backupCount: backup.length,
            currentCount: current.length,

            identical,
            different,
            backupOnly,
            currentOnly,

            noOwnerBackup,
            noOwnerCurrent,

            backupOwnerIds:
                Array.from(backupOwnerIds),

            currentOwnerIds:
                Array.from(currentOwnerIds),

            allOwnerIds:
                Array.from(ownerIds)

        };

    }


    /* =====================================================
       推しIDとの紐づき確認
    ===================================================== */

    function checkOshiLinks(collection, oshiList){

        const knownIds = new Set(
            (oshiList || [])
                .map(item => item.id)
                .filter(Boolean)
        );

        const backupOrphans =
            collection.backupOwnerIds.filter(
                id => !knownIds.has(id)
            );

        const currentOrphans =
            collection.currentOwnerIds.filter(
                id => !knownIds.has(id)
            );

        return {
            backupOrphans,
            currentOrphans,
            knownOshiCount: knownIds.size
        };

    }


    /* =====================================================
       localStorage比較
    ===================================================== */

    function makeBackupStorageMap(storageData){

        const result = new Map();

        Object.entries(storageData || {})
            .forEach(([storageId, item]) => {

                if(!item || typeof item !== "object"){
                    return;
                }

                const key =
                    item.name ||
                    item.id ||
                    storageId;

                if(key === "oshi_app_data"){
                    return;
                }

                if(item.exists === false){
                    return;
                }

                result.set(key, item.value);

            });

        return result;

    }


    function makeCurrentStorageMap(storageItems){

        const result = new Map();

        (storageItems || []).forEach(item => {

            if(!item || !item.key){
                return;
            }

            if(item.key === "oshi_app_data"){
                return;
            }

            result.set(
                item.key,
                parseStoredValue(item.rawValue)
            );

        });

        return result;

    }


    function compareLocalStorage(
        backupStorage,
        currentStorage
    ){

        const backup =
            makeBackupStorageMap(backupStorage);

        const current =
            makeCurrentStorageMap(currentStorage);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        backup.forEach((value, key) => {

            if(!current.has(key)){

                backupOnly.push(key);

            }else if(
                sameValue(value, current.get(key))
            ){

                identical.push(key);

            }else{

                different.push(key);

            }

        });

        current.forEach((value, key) => {

            if(!backup.has(key)){
                currentOnly.push(key);
            }

        });

        return {
            backupCount: backup.size,
            currentCount: current.size,
            backupOnly,
            currentOnly,
            identical,
            different
        };

    }


    /* =====================================================
       メディアSHA-256
    ===================================================== */

    async function calculateBlobHash(file){

        if(
            !file ||
            typeof file.arrayBuffer !== "function"
        ){

            throw new Error(
                "メディアファイルを読み取れません。"
            );

        }

        if(
            !window.crypto ||
            !window.crypto.subtle
        ){

            throw new Error(
                "ファイル内容の安全な比較機能が利用できません。"
            );

        }

        const buffer =
            await file.arrayBuffer();

        const hash =
            await crypto.subtle.digest(
                "SHA-256",
                buffer
            );

        return Array.from(
            new Uint8Array(hash)
        )
        .map(value =>
            value.toString(16).padStart(2, "0")
        )
        .join("");

    }


    function makeMediaMap(records){

        const map = new Map();
        const duplicates = [];

        (records || []).forEach(item => {

            if(
                !item ||
                item.id === undefined ||
                item.id === null
            ){
                return;
            }

            const id = String(item.id);

            if(map.has(id)){

                duplicates.push(id);

            }else{

                map.set(id, item);

            }

        });

        return {
            map,
            duplicates
        };

    }


    async function compareMedia(
        backupMedia,
        currentMedia
    ){

        const backup =
            makeMediaMap(backupMedia);

        const current =
            makeMediaMap(currentMedia);

        const backupOnly = [];
        const currentOnly = [];
        const identical = [];
        const different = [];

        for(const [id, backupItem] of backup.map.entries()){

            if(!current.map.has(id)){

                backupOnly.push(id);
                continue;

            }

            const currentItem =
                current.map.get(id);

            const backupHash =
                await calculateBlobHash(
                    backupItem.file
                );

            const currentHash =
                await calculateBlobHash(
                    currentItem.file
                );

            if(backupHash === currentHash){

                identical.push(id);

            }else{

                different.push(id);

            }

        }

        current.map.forEach((item, id) => {

            if(!backup.map.has(id)){
                currentOnly.push(id);
            }

        });

        return {

            backupCount: backup.map.size,
            currentCount: current.map.size,

            backupOnly,
            currentOnly,
            identical,
            different,

            duplicateBackupIds:
                backup.duplicates,

            duplicateCurrentIds:
                current.duplicates

        };

    }


    /* =====================================================
       PC・スマホデータ比較
       読み取り専用
    ===================================================== */

    async function compareBackupData(backupData){

        if(
            !window.BackupSafety ||
            typeof BackupSafety.inspectCurrentData !== "function"
        ){

            throw new Error(
                "現在のPCデータ確認機能がありません。"
            );

        }

        showMessage(
            "現在のPCデータを読み取り中です…"
        );

        const currentResult =
            await BackupSafety.inspectCurrentData();

        if(
            !currentResult ||
            !currentResult.report ||
            !currentResult.snapshot
        ){

            throw new Error(
                "PCデータを正常に取得できませんでした。"
            );

        }

        const snapshot =
            currentResult.snapshot;

        showMessage(
            "メインデータを比較しています…"
        );

        const main =
            compareMainData(
                backupData.mainData,
                snapshot.mainData
            );

        const oshiList =
            compareOshiListDetail(
                backupData.mainData,
                snapshot.mainData
            );

        showMessage(
            "推し詳細情報を比較しています…"
        );

        const oshiDetails =
            compareDataCollection(
                backupData.mainData?.oshiDetails,
                snapshot.mainData?.oshiDetails,
                "oshiDetails"
            );

        showMessage(
            "推し記録を比較しています…"
        );

        const oshiRecords =
            compareDataCollection(
                backupData.mainData?.oshiRecords,
                snapshot.mainData?.oshiRecords,
                "oshiRecords"
            );

        const detailsLinks =
            checkOshiLinks(
                oshiDetails,
                [
                    ...oshiList.backupItems,
                    ...oshiList.currentItems
                ]
            );

        const recordsLinks =
            checkOshiLinks(
                oshiRecords,
                [
                    ...oshiList.backupItems,
                    ...oshiList.currentItems
                ]
            );

        showMessage(
            "その他の保存データを比較しています…"
        );

        const storage =
            compareLocalStorage(
                backupData.localStorage,
                snapshot.localStorage
            );

        showMessage(
            "写真・動画の内容を比較しています…"
        );

        const media =
            await compareMedia(
                backupData.media,
                snapshot.media
            );

        return {
            main,
            oshiList,
            oshiDetails,
            oshiRecords,
            detailsLinks,
            recordsLinks,
            storage,
            media
        };

    }


    /* =====================================================
       表示用リスト
    ===================================================== */

    function formatList(label, values){

        return (
            label + "：" +
            (
                values.length
                    ? values.join("、")
                    : "なし"
            )
        );

    }


    function formatOshiList(label, items){

        const values =
            (items || []).map(item => {

                const name =
                    item.name || "名前なし";

                const id =
                    item.id || "IDなし";

                return name + "（ID：" + id + "）";

            });

        return (
            label + "：" +
            (
                values.length
                    ? values.join("、")
                    : "なし"
            )
        );

    }


    function formatCollectionItems(label, items){

        const values =
            (items || []).map(entry => {

                const info =
                    entry.backup || entry;

                const owner =
                    info.ownerId
                        ? "推しID：" + info.ownerId
                        : "推しID未確認";

                const record =
                    info.recordId
                        ? "データID：" + info.recordId
                        : "データID未設定";

                const name =
                    info.name
                        ? "名前：" + info.name
                        : "";

                return [
                    owner,
                    record,
                    name
                ].filter(Boolean).join(" / ");

            });

        return (
            label + "：" +
            (
                values.length
                    ? values.join("、")
                    : "なし"
            )
        );

    }


    /* =====================================================
       比較結果表示
    ===================================================== */

    function showInspectionResult(report, comparison){

        const container =
            document.getElementById(
                "restoreBackupInspection"
            );

        const result =
            document.getElementById(
                "restoreBackupInspectionResult"
            );

        if(!container || !result){

            throw new Error(
                "検査結果の表示欄が見つかりません。"
            );

        }

        const lines = [

            "【スマホZIP検査結果】",
            "検査成功",
            "ファイル名：" + report.filename,
            "作成日時：" + report.createdAt,

            "メインデータ：" +
                report.mainDataItems.length + "項目",

            "その他の保存データ：" +
                report.localStorageItems.length + "項目",

            "写真・動画：" +
                report.mediaCount + "件",

            "メディア容量：" +
                (
                    report.mediaSize / 1024 / 1024
                ).toFixed(2) + " MB",

            "ZIP内ファイル：" +
                report.zipEntryCount + "件",

            "CRC検証：" +
                report.checkedCRCCount + "件",

            "",
            "====================",
            "【PCとの比較結果】",
            "※まだデータの変更はありません。",

            "",
            "■ メインデータ",

            "スマホ：" +
                comparison.main.backupCount + "項目",

            "PC：" +
                comparison.main.currentCount + "項目",

            "一致：" +
                comparison.main.identical.length + "項目",

            "内容が異なる項目：" +
                comparison.main.different.length + "項目",

            "スマホのみ：" +
                comparison.main.backupOnly.length + "項目",

            "PCのみ：" +
                comparison.main.currentOnly.length + "項目",

            formatList(
                "内容が異なる項目",
                comparison.main.different
            ),

            "",
            "====================",
            "⭐【推し一覧の詳細比較】",

            "スマホ登録件数：" +
                comparison.oshiList.backupCount + "件",

            "PC登録件数：" +
                comparison.oshiList.currentCount + "件",

            "共通ID・同じ名前：" +
                comparison.oshiList.identical.length + "件",

            "スマホだけの推し：" +
                comparison.oshiList.backupOnly.length + "件",

            "PCだけの推し：" +
                comparison.oshiList.currentOnly.length + "件",

            "同じID・名前が異なる推し：" +
                comparison.oshiList.nameDifferent.length + "件",

            "",
            "【スマホ側の推し一覧】",

            formatOshiList(
                "登録内容",
                comparison.oshiList.backupItems
            ),

            "",
            "【PC側の推し一覧】",

            formatOshiList(
                "登録内容",
                comparison.oshiList.currentItems
            ),

            "",
            "【スマホだけの推し】",

            formatOshiList(
                "登録内容",
                comparison.oshiList.backupOnly
            ),

            "",
            "【PCだけの推し】",

            formatOshiList(
                "登録内容",
                comparison.oshiList.currentOnly
            ),

            "",
            "【同じIDで名前が異なる推し】",

            ...comparison.oshiList.nameDifferent.map(
                item =>
                    "ID：" + item.id +
                    " / スマホ：" + item.backupName +
                    " / PC：" + item.currentName
            ),

            formatList(
                "スマホ側の重複ID",
                comparison.oshiList.duplicateBackupIds.map(
                    item => item.id
                )
            ),

            formatList(
                "PC側の重複ID",
                comparison.oshiList.duplicateCurrentIds.map(
                    item => item.id
                )
            ),

            "スマホ側のID未設定：" +
                comparison.oshiList.missingBackupId.length + "件",

            "PC側のID未設定：" +
                comparison.oshiList.missingCurrentId.length + "件",

            "",
            "====================",
            "📘【推し詳細情報の比較】",

            "スマホ側：" +
                comparison.oshiDetails.backupCount + "件",

            "PC側：" +
                comparison.oshiDetails.currentCount + "件",

            "内容一致：" +
                comparison.oshiDetails.identical.length + "件",

            "同じ識別情報・内容相違：" +
                comparison.oshiDetails.different.length + "件",

            "スマホのみ：" +
                comparison.oshiDetails.backupOnly.length + "件",

            "PCのみ：" +
                comparison.oshiDetails.currentOnly.length + "件",

            formatCollectionItems(
                "スマホのみの詳細情報",
                comparison.oshiDetails.backupOnly
            ),

            formatCollectionItems(
                "PCのみの詳細情報",
                comparison.oshiDetails.currentOnly
            ),

            "スマホ側の推しID未確認：" +
                comparison.oshiDetails.noOwnerBackup.length + "件",

            "PC側の推しID未確認：" +
                comparison.oshiDetails.noOwnerCurrent.length + "件",

            formatList(
                "スマホ側の孤立した推しID",
                comparison.detailsLinks.backupOrphans
            ),

            formatList(
                "PC側の孤立した推しID",
                comparison.detailsLinks.currentOrphans
            ),

            "",
            "====================",
            "📝【推し記録の比較】",

            "スマホ側：" +
                comparison.oshiRecords.backupCount + "件",

            "PC側：" +
                comparison.oshiRecords.currentCount + "件",

            "内容一致：" +
                comparison.oshiRecords.identical.length + "件",

            "同じ識別情報・内容相違：" +
                comparison.oshiRecords.different.length + "件",

            "スマホのみ：" +
                comparison.oshiRecords.backupOnly.length + "件",

            "PCのみ：" +
                comparison.oshiRecords.currentOnly.length + "件",

            formatCollectionItems(
                "スマホのみの記録",
                comparison.oshiRecords.backupOnly
            ),

            formatCollectionItems(
                "PCのみの記録",
                comparison.oshiRecords.currentOnly
            ),

            "スマホ側の推しID未確認：" +
                comparison.oshiRecords.noOwnerBackup.length + "件",

            "PC側の推しID未確認：" +
                comparison.oshiRecords.noOwnerCurrent.length + "件",

            formatList(
                "スマホ側の孤立した推しID",
                comparison.recordsLinks.backupOrphans
            ),

            formatList(
                "PC側の孤立した推しID",
                comparison.recordsLinks.currentOrphans
            ),

            "",
            "====================",
            "■ その他の保存データ",

            "スマホ：" +
                comparison.storage.backupCount + "キー",

            "PC：" +
                comparison.storage.currentCount + "キー",

            "一致：" +
                comparison.storage.identical.length + "キー",

            "内容が異なるキー：" +
                comparison.storage.different.length + "キー",

            "スマホのみ：" +
                comparison.storage.backupOnly.length + "キー",

            "PCのみ：" +
                comparison.storage.currentOnly.length + "キー",

            formatList(
                "内容が異なるキー",
                comparison.storage.different
            ),

            "",
            "====================",
            "■ 写真・動画",

            "スマホ：" +
                comparison.media.backupCount + "件",

            "PC：" +
                comparison.media.currentCount + "件",

            "同一ID・同一内容：" +
                comparison.media.identical.length + "件",

            "同一ID・内容相違：" +
                comparison.media.different.length + "件",

            "スマホのみ：" +
                comparison.media.backupOnly.length + "件",

            "PCのみ：" +
                comparison.media.currentOnly.length + "件",

            formatList(
                "内容が異なるメディアID",
                comparison.media.different
            ),

            "",
            "====================",
            "比較完了。",
            "この処理では保存・追加・上書き・削除はしていません。"

        ];

        result.textContent =
            lines.join("\n");

        container.style.display = "block";

    }


    /* =====================================================
       ZIP選択後の処理
    ===================================================== */

    async function handleBackupFileChange(event){

        const input = event.target;

        const file =
            input.files && input.files[0];

        if(!file) return;

        selectedBackupFile = file;
        inspectedBackupData = null;

        const nameElement =
            document.getElementById(
                "restoreBackupFileName"
            );

        if(nameElement){
            nameElement.textContent = file.name;
        }

        const inspection =
            document.getElementById(
                "restoreBackupInspection"
            );

        if(inspection){
            inspection.style.display = "none";
        }

        const button =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(button){
            button.disabled = true;
        }

        try{

            showMessage(
                "ZIPファイルを検査しています…"
            );

            if(
                !window.BackupManager ||
                typeof BackupManager.inspectBackupFile !== "function"
            ){

                throw new Error(
                    "バックアップ検査機能が読み込まれていません。"
                );

            }

            const inspected =
                await BackupManager.inspectBackupFile(file);

            if(
                !inspected ||
                !inspected.report ||
                !inspected.report.valid
            ){

                throw new Error(
                    "ZIPファイルの検査に失敗しました。"
                );

            }

            inspectedBackupData =
                inspected.backupData;

            console.log(
                "バックアップZIP検査成功:",
                inspected.report
            );

            const comparison =
                await compareBackupData(
                    inspectedBackupData
                );

            showInspectionResult(
                inspected.report,
                comparison
            );

            if(button){
                button.disabled = false;
            }

            showMessage(
                "ZIP検査とPCデータとの比較が完了しました。"
            );

            console.log(
                "PC・スマホデータ比較結果:",
                comparison
            );

            console.log(
                "⭐ 推し一覧の詳細比較結果:",
                comparison.oshiList
            );

            console.log(
                "📘 推し詳細情報の比較結果:",
                comparison.oshiDetails
            );

            console.log(
                "📝 推し記録の比較結果:",
                comparison.oshiRecords
            );

        }catch(error){

            selectedBackupFile = null;
            inspectedBackupData = null;

            showMessage(
                "検査・比較エラー：" +
                error.message,
                true
            );

            console.error(
                "バックアップ検査・比較エラー:",
                error
            );

        }

    }


    /* =====================================================
       ZIP選択ボタン
    ===================================================== */

    window.selectRestoreBackup = function(){

        const input =
            document.getElementById(
                "restoreBackupFile"
            );

        if(!input){

            showMessage(
                "復元用ファイル選択欄が見つかりません。",
                true
            );

            return;

        }

        input.value = "";
        input.click();

    };


    /* =====================================================
       保護ZIP検証
    ===================================================== */

    function sameStringItems(a, b){

        if(
            !Array.isArray(a) ||
            !Array.isArray(b) ||
            a.length !== b.length
        ){
            return false;
        }

        const left = [...a].sort();
        const right = [...b].sort();

        return left.every(
            (value, index) =>
                value === right[index]
        );

    }


    function verifySafetyBackup(
        originalReport,
        savedReport,
        savedFile,
        originalFile
    ){

        if(
            !savedReport ||
            savedReport.valid !== true
        ){

            throw new Error(
                "保存した保護バックアップが正常ではありません。"
            );

        }

        if(savedFile.size !== originalFile.size){

            throw new Error(
                "保存前後のZIP容量が一致しません。"
            );

        }

        if(
            !sameStringItems(
                originalReport.mainDataItems,
                savedReport.mainDataItems
            )
        ){

            throw new Error(
                "メインデータの検証に失敗しました。"
            );

        }

        if(
            !sameStringItems(
                originalReport.localStorageItems,
                savedReport.localStorageItems
            )
        ){

            throw new Error(
                "保存データの検証に失敗しました。"
            );

        }

        if(
            originalReport.mediaCount !==
                savedReport.mediaCount ||
            originalReport.mediaSize !==
                savedReport.mediaSize ||
            originalReport.zipEntryCount !==
                savedReport.zipEntryCount ||
            originalReport.checkedCRCCount !==
                savedReport.checkedCRCCount
        ){

            throw new Error(
                "保護バックアップの内容が一致しません。"
            );

        }

        return true;

    }


    /* =====================================================
       保護バックアップ作成・保存・再検査
    ===================================================== */

    async function createAndVerifySafetyBackup(saveHandle){

        const safetyResult =
            await BackupSafety.createSafetyBackupFile();

        if(
            !safetyResult ||
            !safetyResult.file ||
            !safetyResult.report ||
            safetyResult.report.valid !== true
        ){

            throw new Error(
                "保護バックアップの作成に失敗しました。"
            );

        }

        let writable = null;

        try{

            writable =
                await saveHandle.createWritable();

            await writable.write(
                safetyResult.file
            );

            await writable.close();

            writable = null;

        }catch(error){

            if(writable){

                try{
                    await writable.abort();
                }catch(abortError){
                    console.error(abortError);
                }

            }

            throw error;

        }

        const savedFile =
            await saveHandle.getFile();

        const savedInspection =
            await BackupManager.inspectBackupFile(
                savedFile
            );

        verifySafetyBackup(
            safetyResult.report,
            savedInspection.report,
            savedFile,
            safetyResult.file
        );

        return savedInspection.report;

    }


    /* =====================================================
       保護バックアップファイル名
    ===================================================== */

    function createSafetyFileName(){

        const now = new Date();

        const pad = value =>
            String(value).padStart(2, "0");

        const date =
            now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate());

        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());

        return (
            "推し活手帳_復元前保護バックアップ_" +
            date + "_" + time + ".zip"
        );

    }


    /* =====================================================
       保護バックアップボタン
       ※スマホデータの復元はしない
    ===================================================== */

    window.startRestoreBackup = async function(){

        if(
            !selectedBackupFile ||
            !inspectedBackupData
        ){

            showMessage(
                "先にバックアップZIPを選択してください。",
                true
            );

            return;

        }

        const button =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(button){
            button.disabled = true;
        }

        try{

            if(
                typeof window.showSaveFilePicker !== "function"
            ){

                throw new Error(
                    "このブラウザでは保存完了を確認できません。"
                );

            }

            showMessage(
                "保護バックアップの保存先を選択してください。"
            );

            const saveHandle =
                await window.showSaveFilePicker({

                    suggestedName:
                        createSafetyFileName(),

                    types: [
                        {
                            description:
                                "推し活手帳 保護バックアップ",

                            accept: {
                                "application/zip": [".zip"]
                            }
                        }
                    ]

                });

            showMessage(
                "PCデータの保護バックアップを作成しています…"
            );

            const report =
                await createAndVerifySafetyBackup(
                    saveHandle
                );

            showMessage(
                "保護バックアップの保存と再検査に成功しました。\n" +
                "メインデータ：" +
                report.mainDataItems.length + "項目\n" +
                "その他の保存データ：" +
                report.localStorageItems.length + "項目\n" +
                "写真・動画：" +
                report.mediaCount + "件\n" +
                "ZIP内ファイル：" +
                report.zipEntryCount + "件\n\n" +
                "スマホ側データの取り込みは、まだ実行していません。"
            );

        }catch(error){

            showMessage(
                error.name === "AbortError"
                    ? "保存がキャンセルされました。"
                    : "保護バックアップエラー：" +
                      error.message,
                true
            );

            console.error(
                "保護バックアップ処理エラー:",
                error
            );

        }finally{

            if(button){
                button.disabled = false;
            }

        }

    };


    /* =====================================================
       UI初期化
    ===================================================== */

    window.initRestoreBackupUI = function(){

        const input =
            document.getElementById(
                "restoreBackupFile"
            );

        if(!input){

            console.error(
                "復元用ファイル選択欄が見つかりません。"
            );

            return false;

        }

        if(
            input.dataset.restoreHandlerReady !== "true"
        ){

            input.addEventListener(
                "change",
                handleBackupFileChange
            );

            input.dataset.restoreHandlerReady = "true";

        }

        selectedBackupFile = null;
        inspectedBackupData = null;

        input.value = "";

        const button =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(button){
            button.disabled = true;
        }

        const inspection =
            document.getElementById(
                "restoreBackupInspection"
            );

        if(inspection){
            inspection.style.display = "none";
        }

        showMessage("");

        console.log(
            "バックアップ復元UI初期化成功"
        );

        return true;

    };

})();
