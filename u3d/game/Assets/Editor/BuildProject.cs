using System;
using System.IO;
using System.Linq;
using FlappyX.UnityAdapter;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class BuildProject
{
    private const string Scene = "Assets/Scenes/Main.unity";
    private static void PrepareRenderPipeline()
    {
        const string rendererPath = "Assets/Settings/FlappyRenderer2D.asset";
        const string pipelinePath = "Assets/Settings/FlappyURP.asset";
        Directory.CreateDirectory("Assets/Settings");
        var renderer = AssetDatabase.LoadAssetAtPath<Renderer2DData>(rendererPath);
        if (renderer == null)
        {
            renderer = ScriptableObject.CreateInstance<Renderer2DData>();
            AssetDatabase.CreateAsset(renderer, rendererPath);
        }
        // 无光照精灵保留共享 PNG 的颜色，也作为编辑器中新建 Sprite 的默认材质。
        var rendererSettings = new SerializedObject(renderer);
        rendererSettings.FindProperty("m_DefaultMaterialType").intValue = 1;
        rendererSettings.ApplyModifiedPropertiesWithoutUndo();
        var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(pipelinePath);
        if (pipeline == null)
        {
            pipeline = UniversalRenderPipelineAsset.Create(renderer);
            AssetDatabase.CreateAsset(pipeline, pipelinePath);
        }
        pipeline.supportsHDR = false;
        pipeline.msaaSampleCount = 1;
        pipeline.renderScale = 1;
        pipeline.supportsCameraDepthTexture = false;
        pipeline.supportsCameraOpaqueTexture = false;
        EditorUtility.SetDirty(pipeline);
        GraphicsSettings.defaultRenderPipeline = pipeline;
        var quality = QualitySettings.GetQualityLevel();
        for (var i = 0; i < QualitySettings.names.Length; i++)
        {
            QualitySettings.SetQualityLevel(i, false);
            QualitySettings.renderPipeline = pipeline;
        }
        QualitySettings.SetQualityLevel(quality, false);
    }
    public static void Prepare()
    {
        PrepareRenderPipeline();
        PlayerSettings.companyName = "FlappyX"; PlayerSettings.productName = "FlappyX Unity";
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone, "local.flappyx.unity");
        PlayerSettings.defaultScreenWidth = 1024; PlayerSettings.defaultScreenHeight = 768;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed; PlayerSettings.resizableWindow = true;
        PlayerSettings.runInBackground = true; PlayerSettings.colorSpace = ColorSpace.Gamma;
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
        PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneOSX, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneOSX, new[] { GraphicsDeviceType.Metal });
        PlayerSettings.SetArchitecture(NamedBuildTarget.Standalone, 2);
        var settings = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
        settings.FindProperty("activeInputHandler").intValue = 1; settings.ApplyModifiedPropertiesWithoutUndo();
        QualitySettings.antiAliasing = 0; QualitySettings.vSyncCount = 0;
        foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { "Assets/Resources/Content" }))
        {
            var importer = (TextureImporter)AssetImporter.GetAtPath(AssetDatabase.GUIDToAssetPath(guid));
            importer.textureType = TextureImporterType.Sprite; importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = 1; importer.mipmapEnabled = false; importer.filterMode = FilterMode.Point;
            importer.wrapMode = TextureWrapMode.Clamp; importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.alphaIsTransparency = false; importer.npotScale = TextureImporterNPOTScale.None;
            var textureSettings = new TextureImporterSettings(); importer.ReadTextureSettings(textureSettings);
            textureSettings.spriteMeshType = SpriteMeshType.FullRect; textureSettings.spritePivot = new Vector2(.5f, .5f);
            importer.SetTextureSettings(textureSettings); importer.SaveAndReimport();
        }
        Directory.CreateDirectory("Assets/Scenes"); Directory.CreateDirectory("Assets/Materials");
        var shader = Shader.Find("Universal Render Pipeline/2D/Sprite-Unlit-Default")
            ?? throw new InvalidOperationException("Missing URP 2D sprite shader");
        var material = AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Sprites.mat");
        if (material == null)
        {
            material = new Material(shader); AssetDatabase.CreateAsset(material, "Assets/Materials/Sprites.mat");
        }
        material.shader = shader;
        EditorUtility.SetDirty(material);
        if (!File.Exists(Scene))
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var app = new GameObject("Flappy Bird").AddComponent<FlappyGame>(); app.SpriteMaterial = material;
            EditorSceneManager.SaveScene(scene, Scene);
        }
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };
        AssetDatabase.SaveAssets(); EditorSceneManager.OpenScene(Scene);
        Debug.Log("FlappyX Unity project prepared");
    }
    public static void Build()
    {
        Prepare();
        var path = Path.GetFullPath("../build/FlappyX.app");
        var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { Scene }, locationPathName = path,
            target = BuildTarget.StandaloneOSX, options = BuildOptions.None });
        if (result.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Unity build failed: " + result.summary.result);
        Debug.Log("FlappyX Unity build succeeded: " + result.summary.totalSize + " bytes");
    }
    public static void Check()
    {
        Prepare(); EditorApplication.EnterPlaymode();
    }
    public static void BuildWeb()
    {
        Prepare();
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.WebGL, ScriptingImplementation.IL2CPP);
        PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.WebGL, ApiCompatibilityLevel.NET_Standard);
        PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Minimal);
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = true;
        PlayerSettings.WebGL.threadsSupport = false;
        PlayerSettings.WebGL.template = "PROJECT:FlappyX";
        var path = Environment.GetCommandLineArgs().Single(arg => arg.StartsWith("--web-output=", StringComparison.Ordinal)).Substring(13);
        var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { Scene }, locationPathName = path,
            target = BuildTarget.WebGL, options = BuildOptions.None });
        if (result.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Unity Web build failed: " + result.summary.result);
        Debug.Log("FlappyX Unity Web build succeeded: " + result.summary.totalSize + " bytes");
    }
}
