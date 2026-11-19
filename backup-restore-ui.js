
/* =========================================================
   推し活手帳
   バックアップ復元 UI

   ・ZIP選択
   ・ZIP内容検査
   ・PCデータとの読み取り専用比較
   ・推し一覧の詳細比較
   ・復元前保護バックアップ作成、保存、再検査

   ※スマホデータの復元・統合はまだ行わない
========================================================= */

(function(){

    let selectedBackupFile = null;
    let inspectedBackupData = null;


    /* =====================
       メッセージ表示
    ===================== */

    function showMessage(message, isError = false){

        const element =
            document.getElementById("restoreBackupMessage");

        if(!element) return;

        element.textContent = message;
        element.style.color = isError ? "#d33" : "";

    }


    /* =====================
       データ比較用JSON
       オブジェクトのキー順を統一
    ===================== */

    function normalizeValue(value){

        if(Array.isArray(value)){
            return value.map(normalizeValue);
        }

        if(value && typeof value === "object"){

            const result = {};

            Object.keys(value)
                .sort()
                .forEach(key => {

                    result[key] =
                        normalizeValue(value[key]);

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


    /* =====================
       メインデータ比較
    ===================== */

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


    /* =====================
       ⭐ 推し一覧を配列に変換
    ===================== */

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

            return Object.entries(data).map(
                ([key, item]) => ({
                    item,
                    objectKey: key
                })
            );

        }

        return [];

    }


    /* =====================
       ⭐ 推し情報を取得
    ===================== */

    function getOshiInfo(entry){

        const item = entry.item;

        if(!item || typeof item !== "object"){

            return {
                id: "",
                name: ""
            };

        }

        const id =
            item.id ??
            item.oshiId ??
            item.uid ??
            entry.objectKey ??
            "";

        const name =
            item.name ??
            item.oshiName ??
            item.title ??
            item.groupName ??
            "";

        return {
            id: String(id),
            name: String(name)
        };

    }


    /* =====================
       ⭐ 推し一覧の詳細比較
       読み取り専用
    ===================== */

    function compareOshiListDetail(
        backupMainData,
        currentMainData
    ){

        const backupEntries =
            convertOshiList(
                backupMainData?.oshiList
            );

        const currentEntries =
            convertOshiList(
                currentMainData?.oshiList
            );

        const backup =
            backupEntries.map(getOshiInfo);

        const current =
            currentEntries.map(getOshiInfo);

        const backupIds = new Set(
            backup
                .filter(item => item.id)
                .map(item => item.id)
        );

        const currentIds = new Set(
            current
                .filter(item => item.id)
                .map(item => item.id)
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
                    current.find(
                        other => other.id === item.id
                    );

                if(matched){

                    if(item.name === matched.name){

                        identical.push({
                            id: item.id,
                            name: item.name
                        });

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

            if(!item.id){

                return;

            }

            if(!backupIds.has(item.id)){

                currentOnly.push(item);

            }

        });

        const missingBackupId =
            backup.filter(item => !item.id);

        const missingCurrentId =
            current.filter(item => !item.id);

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
                .map(([id, count]) => ({
                    id,
                    count
                }));

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

            missingBackupId,
            missingCurrentId,

            duplicateBackupIds:
                findDuplicateIds(backup),

            duplicateCurrentIds:
                findDuplicateIds(current)

        };

    }


    /* =====================
       localStorage比較用データ
    ===================== */

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


    /* =====================
       localStorage比較
    ===================== */

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


    /* =====================
       メディアSHA-256
    ===================== */

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


    /* =====================
       メディアIDマップ
    ===================== */

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


    /* =====================
       メディア比較
       同じIDはファイル内容まで比較
    ===================== */

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

        const backupEntries =
            Array.from(backup.map.entries());

        for(const [id, backupItem] of backupEntries){

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


    /* =====================
       PC・スマホデータ比較
       読み取り専用
    ===================== */

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
            "メインデータと保存データを比較しています…"
        );

        const main =
            compareMainData(
                backupData.mainData,
                snapshot.mainData
            );

        /* ⭐ 推し一覧の詳細比較 */

        const oshiList =
            compareOshiListDetail(
                backupData.mainData,
                snapshot.mainData
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
            storage,
            media
        };

    }


    /* =====================
       表示用リスト
    ===================== */

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


    /* =====================
       比較結果表示
    ===================== */

    function showInspectionResult(
        report,
        comparison
    ){

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
                    report.mediaSize /
                    1024 /
                    1024
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


    /* =====================
       ZIP選択後の処理
    ===================== */

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


    /* =====================
       ZIP選択ボタン
    ===================== */

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


    /* =====================
       保護ZIP検証
    ===================== */

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


    /* =====================
       保護バックアップ作成
       保存・再検査
    ===================== */

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


    /* =====================
       保護バックアップファイル名
    ===================== */

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


    /* =====================
       保護バックアップボタン
       ※スマホデータの復元はしない
    ===================== */

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


    /* =====================
       UI初期化
    ===================== */

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
