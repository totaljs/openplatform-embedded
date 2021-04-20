NEWSCHEMA('Users/Members', function(schema) {

	schema.define('email', 'Email');

	schema.setQuery(async function($) {
		var members = [];
		for (var i = 0; i < REPO.members.length; i++) {
			var member = REPO.members[i];
			if (member.userid === $.user.id) {
				member = CLONE(member);
				var user = REPO.users.findItem('email', member.email);
				if (user) {
					member.id = user.id;
					member.email = user.email;
					member.name = user.name;
					member.photo = user.photo;
				}
				members.push(member);
			}
		}
		members.quicksort('dtcreated_desc');
		$.callback(members);
	});

	schema.setSave(function($, model) {

		var members = REPO.members.findAll('userid', $.user.id);

		if (CONF.maxmembers && members.length > CONF.maxmembers) {
			$.invalid('@(You have exceed a maximum count of members)');
			return;
		}

		if ($.user.email === model.email) {
			$.invalid('@(You can\'t add your email address to your member list)');
			return;
		}

		if (members.length && members.findItem('email', model.email)) {
			$.invalid('@(Email is already registered in your member list)');
			return;
		}

		model.id = UID();
		model.userid = $.user.id;
		model.dtcreated = NOW;

		REPO.members.push(model);
		DBMS().log($, model, model.email);
		FUNC.clearcache($.user.id);
		FUNC.save('members');
		$.success();
	});

	schema.setRemove(function($) {

		var index = REPO.members.findIndex(n => n.id === $.id && n.userid === $.user.id);
		var member = index === -1 ? null : REPO.members[index];

		if (member) {
			REPO.members.splice(index, 1);
			DBMS().log($, null, member.email);
			FUNC.save('members');
		}

		$.success();
	});

});