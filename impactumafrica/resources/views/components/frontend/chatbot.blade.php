<!-- Chatbot flottant -->
<div id="chatbot-container">
    <div id="chatbot-header" onclick="toggleChat()">
        💬 Chat avec Impactum
    </div>
    <div id="chatbot-body">
        <div id="chatbot-messages"></div>
        <input type="text" id="chatbot-input" placeholder="Posez votre question..." onkeypress="handleKeyPress(event)">
        <button onclick="sendMessage()">Envoyer</button>
    </div>
</div>
