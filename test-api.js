/* ═══════════════════════════════════════════════════════════
   API TEST UTILITY
   Run this in the browser console to verify the API key works
═══════════════════════════════════════════════════════════ */

async function testDeepSeekAPI() {
  console.log("🧪 Testing DeepSeek API...");

  const apiKey = localStorage.getItem("deepseek_api_key");

  if (!apiKey) {
    console.error("❌ API key not found!");
    console.log("Please set your API key first:");
    console.log("localStorage.setItem('deepseek_api_key', 'sk-...')");
    return;
  }

  console.log("✅ API key found:", apiKey.substring(0, 10) + "...");

  try {
    console.log("📡 Sending test request to DeepSeek API...");

    const response = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: 'Reply with just: {"test": "success"}',
            },
          ],
        }),
      },
    );

    console.log("📬 Response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ API Error:", errorData);
      return;
    }

    const data = await response.json();
    console.log("✅ API Response received:", data);

    if (data.choices && data.choices[0] && data.choices[0].message) {
      console.log("✅ SUCCESS! API is working correctly");
      console.log("Message:", data.choices[0].message.content);
    }
  } catch (error) {
    console.error("❌ Network error:", error);
  }
}

// Run the test
testDeepSeekAPI();
