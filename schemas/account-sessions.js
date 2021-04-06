NEWSCHEMA('Account/Sessions', function(schema) {

	schema.setQuery(function($) {

		var arr = [];

		for (var i = 0; i < REPO.sessions.length; i++) {
			var item = REPO.sessions[i];
			if (item.userid === $.user.id) {
				if (item.id === $.sessionid) {
					item = CLONE(item);
					item.current = true;
				}

				arr.push(item);
			}
		}

		$.callback(arr);
	});

	schema.setRemove(function($) {

		var id = $.id;
		var session = MAIN.session.sessions[id];
		var iscurrent = session && session.sessionid === $.sessionid;

		if (session)
			delete MAIN.session.sessions[id];

		var index = REPO.sessions.findIndex('id', id);
		var item = index === -1 ? null : REPO.sessions[index];
		if (!item || item.userid !== $.user.id) {
			$.invalid('@(Invalid session identifier)');
			return;
		}

		DBMS().log($, null, item.ua);
		REPO.sessions.splice(index, 1);
		FUNC.save('sessions');
		$.success(iscurrent);

	});

});