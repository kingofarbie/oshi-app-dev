
/* =========================================================
   推し活手帳
   バックアップ復元 UI

   ・ZIP選択
   ・ZIP内容検査
   ・復元前保護バックアップ作成
   ・保護ZIP保存
   ・保存済みZIP再検査

   ※この版ではスマホデータの復元はまだ行わない
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
        element.style.color =
            isError ? "#d33" : "";

    }


    /* =====================
       検査結果表示
    ===================== */

    function showInspectionResult(report){

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

            "ZIPファイルの検査に成功しました。",
            "",
            "ファイル名：" + report.filename,
            "作成日時：" + report.createdAt,
            "",
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

            "",
            "ZIP内ファイル数：" +
                report.zipEntryCount,

            "CRC検証済み：" +
                report.checkedCRCCount + "件",

            "",
            "※まだ復元は実行されていません。"

        ];

        result.textContent = lines.join("\n");
        container.style.display = "block";

    }


    /* =====================
       ZIPファイル選択後の処理
    ===================== */

    async function handleBackupFileChange(event){

        const input = event.target;

        const file =
            input.files && input.files[0];

        if(!file) return;

        selectedBackupFile = file;
        inspectedBackupData = null;

        console.log(
            "バックアップZIP選択:",
            file.name,
            file.size
        );

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

        const restoreButton =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(restoreButton){
            restoreButton.disabled = true;
        }

        showMessage("ZIPファイルを検査しています…");

        try{

            if(
                !window.BackupManager ||
                typeof BackupManager.inspectBackupFile !==
                    "function"
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

            showInspectionResult(inspected.report);

            if(restoreButton){
                restoreButton.disabled = false;
            }

            showMessage(
                "検査が完了しました。内容を確認してください。"
            );

            console.log(
                "バックアップZIP検査成功:",
                inspected.report
            );

        }catch(error){

            selectedBackupFile = null;
            inspectedBackupData = null;

            showMessage(
                "検査エラー：" + error.message,
                true
            );

            console.error(
                "バックアップZIP検査エラー:",
                error
            );

        }

    }


    /* =====================
       ZIPファイル選択ボタン
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
       配列内容の比較
    ===================== */

    function sameStringItems(a, b){

        if(
            !Array.isArray(a) ||
            !Array.isArray(b) ||
            a.length !== b.length
        ){
            return false;
        }

        const left =
            [...a].sort();

        const right =
            [...b].sort();

        return left.every(
            (value, index) =>
                value === right[index]
        );

    }


    /* =====================
       保護バックアップの検証
    ===================== */

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

        if(
            savedFile.size !== originalFile.size
        ){
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
                savedReport.mediaCount
        ){
            throw new Error(
                "写真・動画の件数が一致しません。"
            );
        }

        if(
            originalReport.mediaSize !==
                savedReport.mediaSize
        ){
            throw new Error(
                "写真・動画の容量が一致しません。"
            );
        }

        if(
            originalReport.zipEntryCount !==
                savedReport.zipEntryCount
        ){
            throw new Error(
                "ZIP内ファイル数が一致しません。"
            );
        }

        if(
            originalReport.checkedCRCCount !==
                savedReport.checkedCRCCount
        ){
            throw new Error(
                "CRC検証件数が一致しません。"
            );
        }

        return true;

    }


    /* =====================
       復元前保護バックアップ
       作成・保存・再検査
    ===================== */

    async function createAndVerifySafetyBackup(){

        if(
            !window.BackupSafety ||
            typeof BackupSafety.createSafetyBackupFile !==
                "function"
        ){

            throw new Error(
                "保護バックアップ機能が読み込まれていません。"
            );

        }

        if(
            !window.BackupManager ||
            typeof BackupManager.inspectBackupFile !==
                "function"
        ){

            throw new Error(
                "ZIP検査機能が読み込まれていません。"
            );

        }

        showMessage(
            "現在のPCデータを確認しています…"
        );

        /* 現在の全データから保護ZIPを作成 */
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

        showMessage(
            "保護バックアップを保存しています…"
        );

        /* 保存先を選んだファイルハンドルを取得 */
        const saveHandle =
            await pendingSaveHandle;

        if(!saveHandle){

            throw new Error(
                "保存先を確定できませんでした。"
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
                    console.error(
                        "保存処理の中止に失敗:",
                        abortError
                    );
                }

            }

            throw error;

        }

        showMessage(
            "保存した保護バックアップを再検査しています…"
        );

        /* 保存先から実際のファイルを再取得 */
        const savedFile =
            await saveHandle.getFile();

        /* 保存済みファイルをもう一度ZIP検査 */
        const savedInspection =
            await BackupManager.inspectBackupFile(
                savedFile
            );

        /* 作成時と保存後の内容を比較 */
        verifySafetyBackup(
            safetyResult.report,
            savedInspection.report,
            savedFile,
            safetyResult.file
        );

        console.log(
            "保護バックアップ保存・再検査成功:",
            savedInspection.report
        );

        return savedInspection.report;

    }


    /* =====================
       保存先選択
    ===================== */

    let pendingSaveHandle = null;


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
       保護バックアップ作成ボタン
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

            /* 保存機能がない場合は中止 */
            if(
                typeof window.showSaveFilePicker !==
                    "function"
            ){

                throw new Error(
                    "このブラウザでは保存完了を確認できません。Chromeなど対応ブラウザで開いてください。"
                );

            }

            /*
              ユーザー操作直後に保存先選択を開始する。
              この前に await を行わない。
            */

            pendingSaveHandle =
                window.showSaveFilePicker({

                    suggestedName:
                        createSafetyFileName(),

                    types: [
                        {
                            description:
                                "推し活手帳 保護バックアップ",

                            accept: {
                                "application/zip": [
                                    ".zip"
                                ]
                            }
                        }
                    ]

                });

            showMessage(
                "保護バックアップの保存先を選択してください。"
            );

            /* 保存先選択後に作成・保存・再検査 */
            const handlePromise =
                pendingSaveHandle;

            const saveHandle =
                await handlePromise;

            pendingSaveHandle =
                Promise.resolve(saveHandle);

            const report =
                await createAndVerifySafetyBackup();

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
                "現在のPCデータは保護されました。\n" +
                "スマホ側データの取り込みは、まだ実行していません。"
            );

            console.log(
                "保護バックアップ完了。復元処理は未実行です。"
            );

        }catch(error){

            showMessage(
                error.name === "AbortError"
                    ? "保存がキャンセルされました。安全のため取り込みは中止しました。"
                    : "保護バックアップを保存・検証できませんでした。取り込みは中止しました。\n" +
                      error.message,
                true
            );

            console.error(
                "保護バックアップ処理エラー:",
                error
            );

        }finally{

            pendingSaveHandle = null;

            if(button){
                button.disabled = true;
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

        const restoreButton =
            document.getElementById(
                "startRestoreBackupButton"
            );

        if(restoreButton){
            restoreButton.disabled = true;
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
